import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnModuleInit } from "@nestjs/common";
import { desc, eq, sql } from "drizzle-orm";
import { DATABASE, type Database } from "../common/database/database.module.js";
import { ConflictError, NotFoundError, ValidationFailedError } from "../common/errors/api-error.js";
import { JOB_QUEUE, type JobQueue, type JobRecord } from "../jobs/job-queue.js";
import { PUBLIC_CACHE_TAGS, RevalidationService } from "../revalidation/revalidation.service.js";
import { SettingsService } from "../settings/settings.service.js";
import { formatDirectoryReport, runDirectoryImport } from "./directory/directory-import.js";
import { onlyDemoRefusal } from "./directory/directory-plan.js";
import { ImportRefusedError } from "./import-run.js";
import { importRuns } from "./import.schema.js";
import { IMPORT_KINDS, IMPORT_SOURCE, type ImportKind, type ImportSource } from "./import-source.js";
import { formatTaxonomyReport, runTaxonomyImport } from "./taxonomy/taxonomy-import.js";
import { formatTreasuryReport, runTreasuryImport } from "./treasury/treasury-import.js";
import { treasuryOnlyDemoRefusal } from "./treasury/treasury-plan.js";

/**
 * Notion imports as background jobs (overview §3.3): the admin's dry runs
 * and applies, and the scheduled runs (`imports.<kind>.schedule`), go
 * through ONE job queue that holds at most one import at a time — on
 * pg-boss, so a queued or running import survives an API restart. The
 * request returns the job at once and the page polls it. The live phase
 * (reading Notion, planning, applying) is kept in memory by the process
 * running the job; the outcome is the job's output, and the durable record
 * of every run stays import_runs, written by the import itself.
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

export const IMPORT_QUEUE = "import.run";

interface ImportJobData {
  kind: ImportKind;
  mode: "dry_run" | "apply";
  triggeredBy: string;
  dryRunId: string | null;
  expectCounts?: unknown;
}

interface ImportJobOutput {
  status: "succeeded" | "refused";
  runId: string | null;
  changes: number | null;
  applicable: boolean;
  report: string | null;
  error: string | null;
}

@Injectable()
export class ImportJobsService implements OnModuleInit, OnApplicationBootstrap {
  private readonly logger = new Logger("Imports");
  /** Jobs this process is running: their live phase. */
  private readonly live = new Map<string, ImportJob>();

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(IMPORT_SOURCE) private readonly source: ImportSource,
    @Inject(JOB_QUEUE) private readonly queue: JobQueue,
    private readonly settings: SettingsService,
    private readonly revalidation: RevalidationService,
  ) {}

  onModuleInit(): void {
    this.queue.define<ImportJobData, ImportJobOutput>(IMPORT_QUEUE, (data, job) => this.execute(job.id, data), {
      policy: "exclusive",
      retryLimit: 0,
      expireInSeconds: 3600,
    });
  }

  /** Scheduled imports from the settings (read at start; a change takes effect on the next restart). */
  async onApplicationBootstrap(): Promise<void> {
    const schedules = await this.settings.getMany(["imports.taxonomy.schedule", "imports.directory.schedule", "imports.treasury.schedule"]);
    for (const kind of IMPORT_KINDS) {
      const cron = schedules[`imports.${kind}.schedule`];
      const active = cron !== "off" && !this.source.unavailable(kind);
      try {
        await this.queue.schedule(IMPORT_QUEUE, kind, active ? cron : null, { kind, mode: "apply", triggeredBy: `schedule:${kind}`, dryRunId: null } satisfies ImportJobData);
        if (active) this.logger.log(`Scheduled ${kind} import: ${cron} (UTC)`);
      } catch (error) {
        this.logger.error(`Couldn't schedule the ${kind} import: ${error instanceof Error ? error.message : "unknown error"}`);
      }
    }
  }

  status() {
    const active = [...this.live.values()].find((job) => job.status === "running") ?? null;
    return {
      taxonomy: { available: !this.source.unavailable("taxonomy"), reason: this.source.unavailable("taxonomy") ?? null },
      directory: { available: !this.source.unavailable("directory"), reason: this.source.unavailable("directory") ?? null },
      treasury: { available: !this.source.unavailable("treasury"), reason: this.source.unavailable("treasury") ?? null },
      activeJob: active,
    };
  }

  async job(id: string): Promise<ImportJob> {
    const live = this.live.get(id);
    if (live) return live;
    const record = await this.queue.get<ImportJobData, ImportJobOutput>(IMPORT_QUEUE, id);
    if (!record) throw new NotFoundError("Import job not found.");
    return fromRecord(record);
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

  startDryRun(kind: ImportKind, triggeredBy: string): Promise<ImportJob> {
    return this.start({ kind, mode: "dry_run", triggeredBy, dryRunId: null });
  }

  /**
   * Apply needs a reviewed dry run: the latest run of this kind, a dry run,
   * at most an hour old. The apply then refuses to write if its fresh plan
   * differs from that dry run's counts.
   */
  async startApply(kind: ImportKind, dryRunId: string, triggeredBy: string): Promise<ImportJob> {
    const [latest] = await this.db.select().from(importRuns).where(eq(importRuns.kind, kind)).orderBy(desc(importRuns.startedAt)).limit(1);
    if (!latest || latest.id !== dryRunId || latest.mode !== "dry_run") {
      throw new ValidationFailedError([{ path: "dryRunId", message: `Apply needs the latest ${kind} dry run: run a dry run first and apply that one.` }]);
    }
    const ageMinutes = (Date.now() - (latest.finishedAt ?? latest.startedAt).getTime()) / 60_000;
    if (ageMinutes > DRY_RUN_MAX_AGE_MINUTES) {
      throw new ValidationFailedError([{ path: "dryRunId", message: `That dry run is older than ${DRY_RUN_MAX_AGE_MINUTES} minutes: run a new one.` }]);
    }
    return this.start({ kind, mode: "apply", triggeredBy, dryRunId, expectCounts: latest.counts });
  }

  private async start(data: ImportJobData): Promise<ImportJob> {
    const reason = this.source.unavailable(data.kind);
    if (reason) throw new ConflictError(reason);
    const id = await this.queue.send(IMPORT_QUEUE, data);
    if (!id) throw new ConflictError("Another import is running: wait for it to finish.");
    return this.live.get(id) ?? this.track(id, data, "queued");
  }

  private track(id: string, data: ImportJobData, phase: JobPhase): ImportJob {
    const job: ImportJob = {
      id,
      kind: data.kind,
      mode: data.mode,
      status: "running",
      phase,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      triggeredBy: data.triggeredBy,
      runId: null,
      dryRunId: data.dryRunId,
      changes: null,
      applicable: false,
      report: null,
      error: null,
    };
    this.live.set(id, job);
    return job;
  }

  /** Resolves when the job is done (tests). */
  async settled(id: string): Promise<ImportJob> {
    for (;;) {
      const job = await this.job(id);
      if (job.status !== "running") return job;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  /** The job's work (in the process that fetched it). Refusals are outcomes, not failures. */
  private async execute(id: string, data: ImportJobData): Promise<ImportJobOutput> {
    const job = this.live.get(id) ?? this.track(id, data, "queued");
    const apply = data.mode === "apply";
    const options = { apply, triggeredBy: data.triggeredBy, expectCounts: data.expectCounts };
    let output: ImportJobOutput = { status: "succeeded", runId: null, changes: null, applicable: false, report: null, error: null };
    try {
      job.phase = "reading_notion";
      if (data.kind === "taxonomy") {
        const source = await this.source.taxonomy();
        job.phase = apply ? "applying" : "planning";
        const result = await runTaxonomyImport(this.db, source, options);
        output = { ...output, runId: result.runId, changes: result.counts.changes, applicable: !apply && result.counts.changes > 0, report: formatTaxonomyReport(result) };
      } else if (data.kind === "directory") {
        const source = await this.source.directory();
        job.phase = apply ? "applying" : "planning";
        const result = await runDirectoryImport(this.db, source, options);
        output = {
          ...output,
          runId: result.runId,
          changes: result.counts.changes,
          applicable: !apply && result.counts.changes > 0 && !onlyDemoRefusal(result.plan),
          report: formatDirectoryReport(result),
        };
      } else {
        const source = await this.source.treasury();
        job.phase = apply ? "applying" : "planning";
        const publishUnqualified = await this.settings.get("treasury.publish_unqualified");
        const result = await runTreasuryImport(this.db, source, { ...options, publishUnqualified });
        // The public Treasury pages read these entries: refresh them now rather than in 5 minutes.
        if (apply && result.counts.changes > 0) await this.revalidation.revalidate([PUBLIC_CACHE_TAGS.treasury]);
        output = {
          ...output,
          runId: result.runId,
          changes: result.counts.changes,
          applicable: !apply && result.counts.changes > 0 && !treasuryOnlyDemoRefusal(result.plan),
          report: formatTreasuryReport(result),
        };
      }
      Object.assign(job, output);
      return output;
    } catch (error) {
      // Messages from the importer and the Notion client never contain the token.
      const message = error instanceof Error ? error.message : "The import failed.";
      if (error instanceof ImportRefusedError) {
        output = { ...output, status: "refused", error: message };
        Object.assign(job, output);
        return output;
      }
      job.status = "failed";
      job.error = message;
      this.logger.error(`${data.kind} ${data.mode} failed: ${message}`);
      throw error;
    } finally {
      job.phase = "done";
      job.finishedAt = new Date().toISOString();
    }
  }
}

function fromRecord(record: JobRecord<ImportJobData, ImportJobOutput>): ImportJob {
  const running = record.state === "queued" || record.state === "active";
  const output = record.output;
  return {
    id: record.id,
    kind: record.data.kind,
    mode: record.data.mode,
    status: running ? "running" : record.state === "completed" ? (output?.status ?? "succeeded") : "failed",
    phase: running ? (record.state === "queued" ? "queued" : "planning") : "done",
    startedAt: (record.startedAt ?? record.createdAt).toISOString(),
    finishedAt: record.completedAt?.toISOString() ?? null,
    triggeredBy: record.data.triggeredBy,
    runId: output?.runId ?? null,
    dryRunId: record.data.dryRunId,
    changes: output?.changes ?? null,
    applicable: output?.applicable ?? false,
    report: output?.report ?? null,
    error: record.state === "failed" || record.state === "cancelled" ? (record.error ?? "The import failed.") : (output?.error ?? null),
  };
}
