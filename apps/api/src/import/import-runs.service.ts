import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnModuleInit } from "@nestjs/common";
import { desc, sql } from "drizzle-orm";
import { DATABASE, type Database } from "../common/database/database.module.js";
import { JOB_QUEUE, type JobQueue } from "../jobs/job-queue.js";
import { importRuns } from "./import.schema.js";

/** The queue the Notion imports ran on, until OPS-154. */
export const IMPORT_QUEUE = "import.run";
/** Every Notion import there was: their schedules are cleared at start. */
export const RETIRED_IMPORT_KINDS = ["directory", "taxonomy", "treasury"] as const;

/**
 * Import runs (OPS-154, client 2026-11-03): CSV is the only import, run
 * from People and Organizations (csv/). The Notion imports are gone; their
 * past runs stay in import_runs and in the History, read here. At start,
 * any schedule they left in the job queue is cleared, and a job still
 * queued from before is refused without running.
 */
@Injectable()
export class ImportRunsService implements OnModuleInit, OnApplicationBootstrap {
  private readonly logger = new Logger(ImportRunsService.name);

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(JOB_QUEUE) private readonly queue: JobQueue,
  ) {}

  onModuleInit(): void {
    this.queue.define(IMPORT_QUEUE, async () => {
      throw new Error("The Notion import was removed (OPS-154): CSV is the only import.");
    }, { policy: "exclusive", retryLimit: 0, expireInSeconds: 60 });
  }

  async onApplicationBootstrap(): Promise<void> {
    for (const kind of RETIRED_IMPORT_KINDS) {
      try {
        await this.queue.schedule(IMPORT_QUEUE, kind, null, {});
      } catch (error) {
        this.logger.error(`Couldn't clear the retired ${kind} import schedule: ${error instanceof Error ? error.message : "unknown error"}`);
      }
    }
  }

  /** Every run, newest first: CSV imports, and the Notion runs from before. */
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
}
