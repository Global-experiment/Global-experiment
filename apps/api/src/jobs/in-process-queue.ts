import { randomUUID } from "node:crypto";
import type { JobHandler, JobQueue, JobRecord, QueueDefinition } from "./job-queue.js";

/**
 * Jobs run at once in this process (next tick), nothing durable: the test
 * driver (NODE_ENV=test), so API tests stay deterministic and need no
 * PostgreSQL job tables. Schedules are recorded, never fired — tests call
 * `runScheduled` to trigger one.
 */
export class InProcessJobQueue implements JobQueue {
  readonly driver = "inprocess" as const;
  private readonly handlers = new Map<string, { handler: JobHandler<object, object | void>; options: QueueDefinition }>();
  private readonly jobs = new Map<string, JobRecord<object, object>>();
  readonly schedules = new Map<string, { name: string; cron: string; data: object }>();

  define<Data extends object, Output extends object | void>(name: string, handler: JobHandler<Data, Output>, options: QueueDefinition = {}): void {
    this.handlers.set(name, { handler: handler as unknown as JobHandler<object, object | void>, options });
  }

  async start(): Promise<void> {}
  async stop(): Promise<void> {}

  async send(name: string, data: object): Promise<string | null> {
    const queue = this.handlers.get(name);
    if (!queue) throw new Error(`No job queue "${name}".`);
    if (queue.options.policy === "exclusive") {
      for (const job of this.jobs.values()) if (job.name === name && (job.state === "queued" || job.state === "active")) return null;
    }
    const job: JobRecord<object, object> = {
      id: randomUUID(),
      name,
      state: "queued",
      data,
      output: null,
      error: null,
      createdAt: new Date(),
      startedAt: null,
      completedAt: null,
    };
    this.jobs.set(job.id, job);
    setImmediate(() => void this.run(job, queue.handler));
    return job.id;
  }

  private async run(job: JobRecord<object, object>, handler: JobHandler<object, object | void>) {
    job.state = "active";
    job.startedAt = new Date();
    try {
      job.output = (await handler(job.data, { id: job.id })) ?? null;
      job.state = "completed";
    } catch (error) {
      job.error = error instanceof Error ? error.message : String(error);
      job.state = "failed";
    } finally {
      job.completedAt = new Date();
    }
  }

  async get<Data = object, Output = object>(name: string, id: string): Promise<JobRecord<Data, Output> | null> {
    const job = this.jobs.get(id);
    return job && job.name === name ? (job as unknown as JobRecord<Data, Output>) : null;
  }

  async schedule(name: string, key: string, cron: string | null, data: object): Promise<void> {
    if (cron) this.schedules.set(`${name}:${key}`, { name, cron, data });
    else this.schedules.delete(`${name}:${key}`);
  }

  /** Tests: fire a recorded schedule now, as pg-boss would at its time. */
  async runScheduled(name: string, key: string): Promise<string | null> {
    const schedule = this.schedules.get(`${name}:${key}`);
    if (!schedule) throw new Error(`No schedule ${name}:${key}.`);
    return this.send(name, schedule.data);
  }
}
