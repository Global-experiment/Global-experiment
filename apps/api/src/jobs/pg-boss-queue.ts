import { PgBoss, type ConstructorOptions, type JobWithMetadata } from "pg-boss";
import type { JobHandler, JobQueue, JobRecord, JobState, QueueDefinition } from "./job-queue.js";

/**
 * pg-boss in the API process (overview §3.3): its own `pgboss` schema in the
 * application database (created and upgraded by pg-boss on start), no
 * Redis. A separate worker process can take over later without changing a
 * job. Logs carry job ids and queue names only.
 */
export class PgBossJobQueue implements JobQueue {
  readonly driver = "pgboss" as const;
  private readonly boss: PgBoss;
  private readonly queues = new Map<string, { handler: JobHandler<object, object | void>; options: QueueDefinition }>();
  private starting: Promise<void> | null = null;

  constructor(
    options: ConstructorOptions,
    private readonly log: { info: (message: string) => void; error: (message: string) => void },
    /** How often an idle worker looks for work (pg-boss default 2 s). */
    private readonly pollingIntervalSeconds = 2,
  ) {
    this.boss = new PgBoss({ schema: "pgboss", application_name: "global-experiment-jobs", ...options });
    this.boss.on("error", (error: Error) => this.log.error(`Job queue error: ${error.message}`));
  }

  define<Data extends object, Output extends object | void>(name: string, handler: JobHandler<Data, Output>, options: QueueDefinition = {}): void {
    if (this.starting) throw new Error(`Queue "${name}" defined after the job queue started.`);
    this.queues.set(name, { handler: handler as unknown as JobHandler<object, object | void>, options });
  }

  start(): Promise<void> {
    this.starting ??= (async () => {
      await this.boss.start();
      for (const [name, { handler, options }] of this.queues) {
        const existing = await this.boss.getQueue(name);
        const settings = { retryLimit: options.retryLimit ?? 0, expireInSeconds: options.expireInSeconds ?? 3600 };
        if (!existing) await this.boss.createQueue(name, { policy: options.policy ?? "standard", ...settings });
        else await this.boss.updateQueue(name, settings);
        await this.boss.work<object, object | void>(name, { batchSize: 1, pollingIntervalSeconds: this.pollingIntervalSeconds }, async ([job]) => {
          if (!job) return undefined;
          const started = Date.now();
          try {
            const output = await handler(job.data ?? {}, { id: job.id });
            this.log.info(`Job ${name} ${job.id} completed in ${Date.now() - started} ms`);
            return output;
          } catch (error) {
            this.log.error(`Job ${name} ${job.id} failed: ${error instanceof Error ? error.message : "unknown error"}`);
            throw error;
          }
        });
      }
      this.log.info(`Job queue started (pg-boss, ${this.queues.size} queues)`);
    })();
    return this.starting;
  }

  async stop(): Promise<void> {
    if (!this.starting) return;
    await this.starting.catch(() => undefined);
    await this.boss.stop({ graceful: true, timeout: 10_000 });
  }

  async send(name: string, data: object): Promise<string | null> {
    await this.start();
    return this.boss.send(name, data);
  }

  async get<Data = object, Output = object>(name: string, id: string): Promise<JobRecord<Data, Output> | null> {
    await this.start();
    const [job] = await this.boss.findJobs<Data>(name, { id });
    return job ? toRecord<Data, Output>(job) : null;
  }

  async schedule(name: string, key: string, cron: string | null, data: object): Promise<void> {
    await this.start();
    if (cron) await this.boss.schedule(name, cron, data, { key, tz: "UTC" });
    else await this.boss.unschedule(name, key);
  }
}

const STATES: Record<JobWithMetadata["state"], JobState> = {
  created: "queued",
  retry: "queued",
  active: "active",
  completed: "completed",
  failed: "failed",
  cancelled: "cancelled",
};

function toRecord<Data, Output>(job: JobWithMetadata<Data>): JobRecord<Data, Output> {
  const failed = job.state === "failed";
  const output = (job.output ?? null) as (Output & { message?: unknown }) | null;
  return {
    id: job.id,
    name: job.name,
    state: STATES[job.state],
    data: job.data,
    output: failed ? null : output,
    error: failed ? (typeof output?.message === "string" ? output.message : "The job failed.") : null,
    createdAt: job.createdOn,
    startedAt: job.state === "created" || job.state === "retry" ? null : job.startedOn,
    completedAt: job.completedOn,
  };
}
