import { Inject, Injectable } from "@nestjs/common";
import { and, asc, eq, inArray } from "drizzle-orm";
import { actorFor, recordAuditEvent } from "../../audit/audit.service.js";
import type { AdminPrincipal } from "../../auth/auth.service.js";
import { DATABASE, type Database } from "../../common/database/database.module.js";
import { ConflictError, NotFoundError, ValidationFailedError } from "../../common/errors/api-error.js";
import { expertiseItems } from "../../expertise/expertise.schema.js";
import { labelOfOrganization } from "../../organizations/organizations.audit.js";
import type { CreateOrganizationRequest } from "../../organizations/organizations.contracts.js";
import { OrganizationsRepository } from "../../organizations/organizations.repository.js";
import { organizations } from "../../organizations/organizations.schema.js";
import { labelOfPerson } from "../../people/people.audit.js";
import type { CreatePersonRequest } from "../../people/people.contracts.js";
import { PeopleRepository } from "../../people/people.repository.js";
import { contactChannels, people, personSources, personStates } from "../../people/people.schema.js";
import { canonicalJson, ImportRefusedError, runImport } from "../import-run.js";
import { importRuns } from "../import.schema.js";
import { autoMapping, CSV_FIELDS, CSV_TABLES, type CsvTable } from "./csv-fields.js";
import { CsvFileError, parseCsv } from "./csv-parse.js";
import { CsvMappingError, csvCounts, planCsvImport, type CsvCounts, type CsvPlan, type CsvPlanRow, type CsvSnapshot } from "./csv-plan.js";

type Executor = Pick<Database, "select" | "insert" | "update" | "delete">;

export interface CsvUpload {
  buffer: Buffer;
  /** The file's name as the browser gave it. */
  fileName: string;
}

export interface CsvOptions {
  /** Field key per column (null = skip); the automatic choice when omitted. */
  mapping?: (string | null)[];
  /** Lines of possible duplicates to import anyway. */
  include?: number[];
}

/** One row of the report (stored in import_runs.issues). */
export interface CsvReportRow {
  line: number;
  name: string;
  /** "not_imported": a valid row of a run that was refused or rolled back. */
  status: "created" | "not_imported" | "duplicate" | "error";
  errors: string[];
  duplicate: CsvPlanRow["duplicate"];
  included: boolean;
  recordId: string | null;
}

const kindOf = (table: CsvTable) => `${table}_csv`;
const tableOfKind = (kind: string): CsvTable | null => CSV_TABLES.find((table) => kindOf(table) === kind) ?? null;
const NOUN: Record<CsvTable, { one: string; collection: string }> = {
  people: { one: "person", collection: "People" },
  organizations: { one: "organization", collection: "Organizations" },
};

/** The file name to show and store: the last path segment, at most 200 characters. */
const cleanFileName = (name: string) => (name.split(/[\\/]/).pop() ?? "").trim().slice(0, 200) || "import.csv";

/**
 * CSV import of People and Organizations (decision of 2026-10-23; the only
 * import besides Notion's, for admins with write access to that table):
 * preview (nothing written), then confirm — the plan is made again from the
 * same file and choices inside ONE transaction and must match what the
 * admin saw, or nothing is written. Each created record gets an "imported"
 * event naming the admin; the run is an import_runs row (who, when, file,
 * counts, every row's outcome) that the report page reads.
 */
@Injectable()
export class CsvImportService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly people: PeopleRepository,
    private readonly organizations: OrganizationsRepository,
  ) {}

  private parse(upload: CsvUpload | undefined) {
    if (!upload) throw new ValidationFailedError([{ path: "file", message: "Choose a CSV file." }]);
    try {
      return parseCsv(upload.buffer);
    } catch (error) {
      if (error instanceof CsvFileError) throw new ValidationFailedError([{ path: "file", message: error.message }]);
      throw error;
    }
  }

  private plan(table: CsvTable, upload: CsvUpload, options: CsvOptions, snapshot: CsvSnapshot): CsvPlan {
    const parsed = this.parse(upload);
    try {
      return planCsvImport({ table, fileName: cleanFileName(upload.fileName), parsed, mapping: options.mapping ?? autoMapping(table, parsed.headers), include: options.include }, snapshot);
    } catch (error) {
      if (error instanceof CsvMappingError) throw new ValidationFailedError([{ path: "mapping", message: error.message }]);
      throw error;
    }
  }

  /** What exists, to resolve names and spot duplicates (archived records included). */
  async snapshot(db: Executor, table: CsvTable): Promise<CsvSnapshot> {
    const records =
      table === "people"
        ? db.select({ id: people.id, name: people.name, email: people.email, website: people.website }).from(people)
        : db.select({ id: organizations.id, name: organizations.name, email: organizations.email, website: organizations.website }).from(organizations);
    const [rows, states, sources, channels, orgs, expertise] = await Promise.all([
      records,
      db.select({ key: personStates.key, label: personStates.label }).from(personStates).orderBy(asc(personStates.sortOrder)),
      db.select({ key: personSources.key, label: personSources.label }).from(personSources).orderBy(asc(personSources.sortOrder)),
      db.select({ key: contactChannels.key, label: contactChannels.label }).from(contactChannels).orderBy(asc(contactChannels.sortOrder)),
      db.select({ id: organizations.id, name: organizations.name }).from(organizations),
      db.select({ id: expertiseItems.id, name: expertiseItems.name }).from(expertiseItems),
    ]);
    return { records: rows, states, sources, channels, organizations: orgs, expertise };
  }

  /** Step 1–3: the file read, the columns matched, every row checked. Writes nothing. */
  async preview(table: CsvTable, upload: CsvUpload | undefined, options: CsvOptions) {
    const parsed = this.parse(upload);
    const plan = this.plan(table, upload!, options, await this.snapshot(this.db, table));
    return {
      table,
      fileName: plan.fileName,
      delimiter: parsed.delimiter,
      headers: parsed.headers,
      /** A few values per column, to recognise it when choosing its field. */
      samples: parsed.headers.map((_header, column) => parsed.rows.map((row) => row.cells[column]!).filter((value) => value !== "").slice(0, 3)),
      mapping: plan.mapping,
      fields: CSV_FIELDS[table].map(({ key, label, required }) => ({ key, label, required: required ?? false })),
      counts: csvCounts(plan),
      // The rows without their create requests (the page shows outcomes, not payloads).
      rows: plan.rows.map((row) => ({ line: row.line, name: row.name, status: row.status, errors: row.errors, duplicate: row.duplicate, included: row.included })),
    };
  }

  /** Step 4: the import, all or nothing, only if it still matches the preview the admin confirmed. */
  async confirm(table: CsvTable, upload: CsvUpload | undefined, options: CsvOptions & { expect: CsvCounts }, admin: AdminPrincipal) {
    this.parse(upload);
    const actor = actorFor(admin);
    const fileName = cleanFileName(upload!.fileName);
    const created = new Map<number, string>();
    try {
      const result = await runImport<CsvPlan>(this.db, {
        kind: kindOf(table),
        apply: true,
        triggeredBy: `admin:${admin.email}`,
        actor,
        label: `CSV import of ${NOUN[table].collection} · ${fileName}`,
        plan: async (tx) => this.plan(table, upload!, options, await this.snapshot(tx, table)),
        refuseApply: (plan) => {
          const counts = csvCounts(plan);
          if (canonicalJson(counts) !== canonicalJson(options.expect)) {
            return "The records changed since the preview (one was added or edited): check the preview again before importing.";
          }
          return counts.create === 0 ? "Nothing to import: every row is a duplicate or has an error." : undefined;
        },
        write: async (tx, plan) => {
          try {
            for (const row of plan.rows) {
              if (row.status !== "create") continue;
              const id = table === "people" ? await this.people.create(tx, row.request as CreatePersonRequest) : await this.organizations.create(tx, row.request as CreateOrganizationRequest);
              created.set(row.line, id);
              const record = table === "people" ? (await this.people.findById(id, tx))! : (await this.organizations.findById(id, tx))!;
              await recordAuditEvent(tx, {
                entityType: table === "people" ? "person" : "organization",
                entityId: id,
                action: "imported",
                actor,
                source: "import",
                meta: {
                  label: table === "people" ? labelOfPerson(record as Parameters<typeof labelOfPerson>[0]) : labelOfOrganization(record as Parameters<typeof labelOfOrganization>[0]),
                  collection: NOUN[table].collection,
                  importSource: "CSV import",
                  fileName,
                },
              });
            }
          } catch (error) {
            // Rolled back: none of these exist.
            created.clear();
            throw error;
          }
        },
        counts: csvCounts,
        issues: (plan) => plan.rows.map((row) => this.reportRow(row, created.get(row.line) ?? null)),
      });
      return { runId: result.runId, counts: csvCounts(result.plan) };
    } catch (error) {
      if (error instanceof ImportRefusedError) throw new ConflictError(error.message);
      throw error;
    }
  }

  private reportRow(row: CsvPlanRow, recordId: string | null): CsvReportRow {
    // Only a written record counts as created (a refused or rolled-back run writes nothing).
    const status = row.status === "create" ? (recordId ? "created" : "not_imported") : row.status;
    return { line: row.line, name: row.name, status, errors: row.errors, duplicate: row.duplicate, included: row.included, recordId };
  }

  /** The report page (OPS-150): who, when, which file, the counts, and every row with links. */
  async report(id: string) {
    const [run] = await this.db
      .select()
      .from(importRuns)
      .where(and(eq(importRuns.id, id), inArray(importRuns.kind, CSV_TABLES.map(kindOf))))
      .limit(1);
    if (!run) throw new NotFoundError("Import report not found.");
    const issues = run.issues as (CsvReportRow | { kind: "error"; code: string; detail: string })[];
    return {
      id: run.id,
      table: tableOfKind(run.kind)!,
      mode: run.mode as "apply" | "failed",
      startedAt: run.startedAt.toISOString(),
      triggeredBy: run.triggeredBy.replace(/^admin:/, ""),
      counts: run.counts as Partial<CsvCounts>,
      failure: issues.find((issue): issue is { kind: "error"; code: string; detail: string } => "kind" in issue)?.detail ?? null,
      rows: issues.filter((issue): issue is CsvReportRow => "line" in issue),
    };
  }
}
