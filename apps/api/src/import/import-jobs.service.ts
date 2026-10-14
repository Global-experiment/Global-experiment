import { Inject, Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { DATABASE, type Database } from "../common/database/database.module.js";
import { ConflictError, NotFoundError, ValidationFailedError } from "../common/errors/api-error.js";
import { formatDirectoryReport, runDirectoryImport } from "./directory/directory-import.js";
import { onlyDemoRefusal } from "./directory/directory-plan.js";
import { ImportRefusedError } from "./import-run.js";
import { importRuns } from "./import.schema.js";
import { IMPORT_SOURCE, type ImportKind, type ImportSource } from "./import-source.js";
import { formatTaxonomyReport, runTaxonomyImport } from "./taxonomy/taxonomy-import.js";

/**
 * Admin-triggered imports, run as background jobs so the HTTP request
 * returns at once (a Notion read of ~1,240 pages takes tens of seconds) and
 * the page polls the job. One job at a time. Jobs live in memory — the
 * durable record of every run is import_runs, written by the import itself.
 */

export type JobPhase = "queued" | "reading_notion" | "planning" | "applying" | "done";
export type JobStatus = "running" | "succeeded" | "failed" | "refused";

export interface ImportJob {
  id: string;
  kind: ImportKind;
  mode: "dry_run" | "apply";
  status: JobStatus;
  phase: JobPhase;
  startedAt: string;
  finishedAt: string | null;
  triggeredBy: string;
  /** The import_runs row this job wrote (dry run or apply). */
  runId: string | null;
  /** The dry run an apply was confirmed from. */
  dryRunId: string | null;
  changes: number | null;
  /** A finished dry run that has something to write and isn't refused (e.g. demo-only): it can be applied. */
  applicable: boolean;
  report: string | null;
  error: string | null;
}

/** An apply must follow its dry run closely: the dry run is what the admin reviewed. */
export const DRY_RUN_MAX_AGE_MINUTES = 60;

@Injectable()
export class ImportJobsService {
  private readonly logger = new Logger("Imports");
  private readonly jobs = new Map<string, ImportJob>();
  private active: string | null = null;

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(IMPORT_SOURCE) private readonly source: ImportSource,
  ) {}

  status() {
    return {
      taxonomy: { available: !this.source.unavailable("taxonomy"), reason: this.source.unavailable("taxonomy") ?? null },
      directory: { available: !this.source.unavailable("directory"), reason: this.source.unavailable("directory") ?? null },
      activeJob: this.active ? this.jobs.get(this.active)! : null,
    };
  }

  job(id: string): ImportJob {
    const job = this.jobs.get(id);
    if (!job) throw new NotFoundError("Import job not found.");
    return job;
  }

  async runs(page: number, pageSize: number) {
    const [items, [count]] = await Promise.all([
      this.db
        .select({
          id: importRuns.id,
          kind: importRuns.kind,
          mode: importRuns.mode,
          startedAt: importRuns.startedAt,
          finishedAt: importRuns.finishedAt,
          triggeredBy: importRuns.triggeredBy,
          counts: importRuns.counts,
          issues: importRuns.issues,
        })
        .from(importRuns)
        .orderBy(desc(importRuns.startedAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      this.db.select({ total: sql<number>`count(*)::int` }).from(importRuns),
    ]);
    return {
      items: items.map((run) => ({ ...run, startedAt: run.startedAt.toISOString(), finishedAt: run.finishedAt?.toISOString() ?? null })),
      page,
      pageSize,
      total: count?.total ?? 0,
    };
  }

  startDryRun(kind: ImportKind, triggeredBy: string): ImportJob {
    return this.start(kind, "dry_run", triggeredBy, null, undefined);
  }

  /**
   * Apply needs a reviewed dry run: the latest run of this kind, a dry run,
   * at most an hour old. The apply then refuses to write if its fresh plan
   * differs from that dry run's counts.
   */
  async startApply(kind: ImportKind, dryRunId: string, triggeredBy: string): Promise<ImportJob> {
    const [latest] = await this.db
      .select()
      .from(importRuns)
      .where(and(eq(importRuns.kind, kind)))
      .orderBy(desc(importRuns.startedAt))
      .limit(1);
    if (!latest || latest.id !== dryRunId || latest.mode !== "dry_run") {
      throw new ValidationFailedError([{ path: "dryRunId", message: `Apply needs the latest ${kind} dry run: run a dry run first and apply that one.` }]);
    }
    const ageMinutes = (Date.now() - (latest.finishedAt ?? latest.startedAt).getTime()) / 60_000;
    if (ageMinutes > DRY_RUN_MAX_AGE_MINUTES) {
      throw new ValidationFailedError([{ path: "dryRunId", message: `That dry run is older than ${DRY_RUN_MAX_AGE_MINUTES} minutes: run a new one.` }]);
    }
    return this.start(kind, "apply", triggeredBy, dryRunId, latest.counts);
  }

  private start(kind: ImportKind, mode: "dry_run" | "apply", triggeredBy: string, dryRunId: string | null, expectCounts: unknown): ImportJob {
    const reason = this.source.unavailable(kind);
    if (reason) throw new ConflictError(reason);
    if (this.active && this.jobs.get(this.active)?.status === "running") {
      throw new ConflictError("Another import is running: wait for it to finish.");
    }
    const job: ImportJob = {
      id: randomUUID(),
      kind,
      mode,
      status: "running",
      phase: "queued",
      startedAt: new Date().toISOString(),
      finishedAt: null,
      triggeredBy,
      runId: null,
      dryRunId,
      changes: null,
      applicable: false,
      report: null,
      error: null,
    };
    this.jobs.set(job.id, job);
    this.active = job.id;
    // Background: the request returns the job; the page polls it.
    setImmediate(() => void this.execute(job, expectCounts));
    return job;
  }

  /** Resolves when the job is done (tests). */
  async settled(id: string): Promise<ImportJob> {
    for (;;) {
      const job = this.job(id);
      if (job.status !== "running") return job;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  private async execute(job: ImportJob, expectCounts: unknown) {
    const apply = job.mode === "apply";
    try {
      job.phase = "reading_notion";
      if (job.kind === "taxonomy") {
        const source = await this.source.taxonomy();
        job.phase = apply ? "applying" : "planning";
        const result = await runTaxonomyImport(this.db, source, { apply, triggeredBy: job.triggeredBy, expectCounts });
        Object.assign(job, {
          runId: result.runId,
          changes: result.counts.changes,
          applicable: !apply && result.counts.changes > 0,
          report: formatTaxonomyReport(result),
        });
      } else {
        const source = await this.source.directory();
        job.phase = apply ? "applying" : "planning";
        const result = await runDirectoryImport(this.db, source, { apply, triggeredBy: job.triggeredBy, expectCounts });
        Object.assign(job, {
          runId: result.runId,
          changes: result.counts.changes,
          applicable: !apply && result.counts.changes > 0 && !onlyDemoRefusal(result.plan),
          report: formatDirectoryReport(result),
        });
      }
      job.status = "succeeded";
    } catch (error) {
      job.status = error instanceof ImportRefusedError ? "refused" : "failed";
      // Messages from the importer and the Notion client never contain the token.
      job.error = error instanceof Error ? error.message : "The import failed.";
      if (job.status === "failed") this.logger.error(`${job.kind} ${job.mode} failed: ${job.error}`);
    } finally {
      job.phase = "done";
      job.finishedAt = new Date().toISOString();
      if (this.active === job.id) this.active = null;
    }
  }
}
