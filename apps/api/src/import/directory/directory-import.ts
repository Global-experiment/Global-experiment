import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import type { Database } from "../../common/database/database.module.js";
import { expertiseItems } from "../../expertise/expertise.schema.js";
import { organizationExpertise, organizations } from "../../organizations/organizations.schema.js";
import { people, peopleExpertise, peopleOrganizations, personSources, personStates } from "../../people/people.schema.js";
import { countsChangedRefusal, runImport } from "../import-run.js";
import {
  countDirectoryPlan,
  onlyDemoRefusal,
  planDirectoryImport,
  type DirectoryCounts,
  type DirectoryPlan,
  type DirectorySnapshot,
  type Issue,
  type PlannedRecord,
  type Ref,
} from "./directory-plan.js";
import type { DirectorySource } from "./directory-source.js";

type Executor = Pick<Database, "select" | "insert" | "update" | "delete" | "execute">;

export async function loadDirectorySnapshot(db: Executor): Promise<DirectorySnapshot> {
  const [organizationRows, peopleRows, personOrganization, personExpertise, organizationTags, items, states, sources] = await Promise.all([
    db
      .select({
        id: organizations.id,
        notionPageId: organizations.notionPageId,
        orgNumber: organizations.orgNumber,
        name: organizations.name,
        description: organizations.description,
        website: organizations.website,
        email: organizations.email,
        wiseRecipientId: organizations.wiseRecipientId,
      })
      .from(organizations),
    db
      .select({
        id: people.id,
        notionPageId: people.notionPageId,
        personNumber: people.personNumber,
        name: people.name,
        stateKey: people.stateKey,
        sourceKey: people.sourceKey,
        personalNote: people.personalNote,
        doNotContact: people.doNotContact,
        email: people.email,
        phone: people.phone,
        website: people.website,
        linkedin: people.linkedin,
        x: people.x,
        otherContact: people.otherContact,
        wiseRecipientId: people.wiseRecipientId,
        nextFollowupOn: people.nextFollowupOn,
      })
      .from(people),
    db.select({ personId: peopleOrganizations.personId, organizationId: peopleOrganizations.organizationId }).from(peopleOrganizations),
    db.select({ personId: peopleExpertise.personId, expertiseId: peopleExpertise.expertiseId }).from(peopleExpertise),
    db.select({ organizationId: organizationExpertise.organizationId, expertiseId: organizationExpertise.expertiseId }).from(organizationExpertise),
    db
      .select({ id: expertiseItems.id, notionPageId: expertiseItems.notionPageId, name: expertiseItems.name })
      .from(expertiseItems)
      .where(isNotNull(expertiseItems.notionPageId)),
    db.select({ key: personStates.key, label: personStates.label }).from(personStates),
    db.select({ key: personSources.key, label: personSources.label }).from(personSources),
  ]);
  return {
    organizations: organizationRows,
    people: peopleRows,
    personOrganization,
    personExpertise,
    organizationExpertise: organizationTags,
    expertiseByPage: new Map(items.map((item) => [item.notionPageId!, item.id])),
    expertiseNames: new Map(items.map((item) => [item.id, item.name])),
    states,
    sources,
  };
}

/** A number no real record uses, to park numbers that move between rows within the transaction. */
const PARKED = 2_000_000_000;

async function writeRecords<Values extends Record<string, unknown>>(
  tx: Executor,
  table: typeof people | typeof organizations,
  numberColumn: "personNumber" | "orgNumber",
  numberSql: string,
  records: PlannedRecord<Values>[],
  ids: Map<string, string>,
  now: Date,
) {
  for (const record of records) if (record.dbId) ids.set(record.pageId, record.dbId);

  // Numbers that move: park them first so the unique index never sees two rows with one number.
  const moving = records.filter((record) => record.action === "update" && record.number !== null);
  for (const [index, record] of moving.entries()) {
    await tx.update(table).set({ [numberColumn]: PARKED + index } as never).where(eq(table.id, record.dbId!));
  }
  for (const record of records.filter((candidate) => candidate.action === "update")) {
    await tx
      .update(table)
      .set({ ...record.values, ...(record.number !== null ? { [numberColumn]: record.number } : {}), updatedAt: now } as never)
      .where(eq(table.id, record.dbId!));
  }

  // Creates with Notion's number first, then advance the sequence past every number in use,
  // so rows created without one (and later admin rows) never collide.
  const creates = records.filter((record) => record.action === "create");
  const insert = async (batch: PlannedRecord<Values>[], withNumber: boolean) => {
    for (let start = 0; start < batch.length; start += 500) {
      const inserted = await tx
        .insert(table)
        .values(batch.slice(start, start + 500).map((record) => ({ ...record.values, ...(withNumber ? { [numberColumn]: record.number } : {}) })) as never)
        .returning({ id: table.id, notionPageId: table.notionPageId });
      for (const row of inserted) ids.set(row.notionPageId!, row.id);
    }
  };
  const numbered = creates.filter((record) => record.number !== null);
  await insert(numbered, true);
  if (numbered.length > 0 || moving.length > 0) {
    const tableName = numberSql.split(".")[0]!;
    const column = numberSql.split(".")[1]!;
    await tx.execute(
      sql.raw(
        `select setval(pg_get_serial_sequence('"${tableName}"', '${column}'), greatest((select max("${column}") from "${tableName}"), nextval(pg_get_serial_sequence('"${tableName}"', '${column}')) - 1), true)`,
      ),
    );
  }
  await insert(
    creates.filter((record) => record.number === null),
    false,
  );
}

/** Writes a directory plan. Must run inside the caller's transaction. */
export async function applyDirectoryPlan(tx: Executor, plan: DirectoryPlan): Promise<void> {
  const now = new Date();
  const organizationIds = new Map<string, string>();
  const personIds = new Map<string, string>();
  await writeRecords(tx, organizations, "orgNumber", "organizations.org_number", plan.organizations, organizationIds, now);
  await writeRecords(tx, people, "personNumber", "people.person_number", plan.people, personIds, now);

  const resolve = (ref: Ref, ids: Map<string, string>) => {
    const id = "dbId" in ref ? ref.dbId : ids.get(ref.pageId);
    if (!id) throw new Error("Internal error: a linked record was not written.");
    return id;
  };
  const touchedPeople = new Set<string>();
  const touchedOrganizations = new Set<string>();

  // Person ↔ Organization.
  const toAdd = plan.personOrganization.add.map((link) => ({ personId: resolve(link.person, personIds), organizationId: resolve(link.organization, organizationIds) }));
  if (toAdd.length > 0) await tx.insert(peopleOrganizations).values(toAdd).onConflictDoNothing();
  for (const link of plan.personOrganization.remove) {
    await tx.delete(peopleOrganizations).where(and(eq(peopleOrganizations.personId, link.personId), eq(peopleOrganizations.organizationId, link.organizationId)));
  }
  for (const link of [...toAdd, ...plan.personOrganization.remove]) {
    touchedPeople.add(link.personId);
    touchedOrganizations.add(link.organizationId);
  }

  // Expertise (Expertise level only).
  const personTags = plan.personExpertise.add.map((link) => ({ personId: resolve(link.owner, personIds), expertiseId: link.expertiseId }));
  if (personTags.length > 0) await tx.insert(peopleExpertise).values(personTags).onConflictDoNothing();
  for (const link of plan.personExpertise.remove) {
    await tx.delete(peopleExpertise).where(and(eq(peopleExpertise.personId, link.ownerId), eq(peopleExpertise.expertiseId, link.expertiseId)));
  }
  for (const link of [...personTags.map((tag) => ({ ownerId: tag.personId })), ...plan.personExpertise.remove]) touchedPeople.add(link.ownerId);

  const organizationTags = plan.organizationExpertise.add.map((link) => ({ organizationId: resolve(link.owner, organizationIds), expertiseId: link.expertiseId }));
  if (organizationTags.length > 0) await tx.insert(organizationExpertise).values(organizationTags).onConflictDoNothing();
  for (const link of plan.organizationExpertise.remove) {
    await tx
      .delete(organizationExpertise)
      .where(and(eq(organizationExpertise.organizationId, link.ownerId), eq(organizationExpertise.expertiseId, link.expertiseId)));
  }
  for (const link of [...organizationTags.map((tag) => ({ ownerId: tag.organizationId })), ...plan.organizationExpertise.remove]) touchedOrganizations.add(link.ownerId);

  // A changed link changes both records (both show it), as in the admin.
  if (touchedPeople.size > 0) await tx.update(people).set({ updatedAt: now }).where(inArray(people.id, [...touchedPeople]));
  if (touchedOrganizations.size > 0) await tx.update(organizations).set({ updatedAt: now }).where(inArray(organizations.id, [...touchedOrganizations]));
}

export interface DirectoryImportOptions {
  apply: boolean;
  triggeredBy: string;
  beforeCommit?: () => Promise<void>;
  /** Apply only if the plan's counts equal these (a reviewed dry run's). */
  expectCounts?: unknown;
}

export interface DirectoryImportResult {
  runId: string;
  mode: "dry_run" | "apply";
  plan: DirectoryPlan;
  counts: DirectoryCounts;
}

export async function runDirectoryImport(db: Database, source: DirectorySource, options: DirectoryImportOptions): Promise<DirectoryImportResult> {
  const result = await runImport(db, {
    kind: "directory",
    apply: options.apply,
    triggeredBy: options.triggeredBy,
    plan: async (executor) => planDirectoryImport(source, await loadDirectorySnapshot(executor as Executor)),
    write: (tx, plan) => applyDirectoryPlan(tx as Executor, plan),
    counts: countDirectoryPlan,
    issues: (plan) => plan.issues,
    refuseApply: (plan) => onlyDemoRefusal(plan) ?? countsChangedRefusal(options.expectCounts, countDirectoryPlan(plan)),
    beforeCommit: options.beforeCommit,
  });
  return { ...result, counts: countDirectoryPlan(result.plan) };
}

const pad = (value: number | string, width: number) => String(value).padStart(width);

export function formatDirectoryReport(result: Pick<DirectoryImportResult, "mode" | "plan" | "counts" | "runId">): string {
  const { plan, counts } = result;
  const lines = [
    result.mode === "dry_run" ? "DIRECTORY IMPORT — DRY RUN (nothing written except the import_runs record)" : "DIRECTORY IMPORT — APPLIED (one transaction)",
    `run ${result.runId}`,
    `Notion: ${plan.totals.people} people (${plan.totals.demo.people} demo), ${plan.totals.organizations} organizations (${plan.totals.demo.organizations} demo)`,
    "",
    "entity          created  updated  unchanged  flagged  skipped  (demo)  missing",
  ];
  for (const [label, c] of [["Organizations", counts.organization], ["People", counts.person]] as const) {
    lines.push(`${label.padEnd(14)} ${pad(c.created, 8)} ${pad(c.updated, 8)} ${pad(c.unchanged, 10)} ${pad(c.flagged, 8)} ${pad(c.skipped, 8)} ${pad(`(${c.demo})`, 7)} ${pad(c.missing, 8)}`);
  }
  const link = (name: string, value: { added: number; removed: number; synced?: boolean }) =>
    value.synced === false ? `${name}: not synced — Notion has no Expertise property; existing links left as they are` : `${name}: ${value.added} added, ${value.removed} removed`;
  lines.push(
    "",
    link("person ↔ organization links", counts.links.personOrganization),
    link("person expertise links", counts.links.personExpertise),
    link("organization expertise links", counts.links.organizationExpertise),
    `links skipped: ${counts.links.skipped}`,
    `ignored for now (future modules): ${counts.ignored.expensesLinks} Expenses links, ${counts.ignored.accessGrantLinks} Access grants links`,
  );
  if (plan.ignored.unreadProperties.length > 0) lines.push(`Notion properties not stored: ${plan.ignored.unreadProperties.join(", ")}`);
  const updates = [...plan.organizations, ...plan.people].filter((record) => record.action === "update");
  if (updates.length > 0) {
    const changed = new Map<string, number>();
    for (const record of updates) for (const field of record.changes) changed.set(field, (changed.get(field) ?? 0) + 1);
    lines.push(`updated fields: ${[...changed].map(([field, n]) => `${field} ${n}`).join(", ")}`);
  }

  const groups: [string, (issue: Issue) => boolean][] = [
    ["Skipped records", (issue) => issue.kind === "skipped"],
    ["Flagged records (imported)", (issue) => issue.kind === "flagged"],
    ["Values left empty", (issue) => issue.kind === "value_skipped"],
    ["Links skipped", (issue) => issue.kind === "link_skipped"],
    ["In the database but not in Notion", (issue) => issue.kind === "missing"],
  ];
  for (const [title, match] of groups) {
    const list = plan.issues.filter(match);
    lines.push("", `${title}: ${list.length}`);
    for (const issue of list) lines.push(`  [${issue.entity}] ${issue.code} — ${issue.name}: ${issue.detail}`);
  }
  const refusal = onlyDemoRefusal(plan);
  if (refusal) lines.push("", refusal);
  lines.push("", counts.changes === 0 ? "Result: 0 changes — the database already matches Notion." : `Result: ${counts.changes} changes.`);
  return lines.join("\n");
}
