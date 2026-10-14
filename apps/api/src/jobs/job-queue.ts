/**
 * Background jobs (docs/architecture/overview.md §3.3). One interface, two
 * drivers: pg-boss (PostgreSQL-backed, durable — production and
 * development) and in-process (tests: runs at once, nothing durable).
 * Payloads and outputs never hold secrets.
 */
export const JOB_QUEUE = Symbol("JOB_QUEUE");

export type JobState = "queued" | "active" | "completed" | "failed" | "cancelled";

export interface JobRecord<Data = object, Output = object> {
  id: string;
  name: string;
  state: JobState;
  data: Data;
  /** The handler's return value (completed), or null. */
  output: Output | null;
  /** The failure's message (failed), or null. */
  error: string | null;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
}

export interface QueueDefinition {
  /**
   * standard: any number of jobs; exclusive: at most one job queued or
   * active — a second send is refused (one import at a time).
   */
  policy?: "standard" | "exclusive";
  /** Retries after a failure (default 0: the caller decides to run again). */
  retryLimit?: number;
  /** How long a job may run before it's failed (default 1 hour). */
  expireInSeconds?: number;
}

export type JobHandler<Data extends object, Output extends object | void> = (data: Data, job: { id: string }) => Promise<Output>;

export interface JobQueue {
  readonly driver: "pgboss" | "inprocess";
  /** Registers a queue and its handler; call in onModuleInit (before start). */
  define<Data extends object, Output extends object | void>(name: string, handler: JobHandler<Data, Output>, options?: QueueDefinition): void;
  /** Idempotent: every caller awaits the same start. */
  start(): Promise<void>;
  stop(): Promise<void>;
  /** The new job's id, or null when the queue's policy refuses it (exclusive queue busy). */
  send(name: string, data: object): Promise<string | null>;
  get<Data = object, Output = object>(name: string, id: string): Promise<JobRecord<Data, Output> | null>;
  /** A recurring job under `key` (cron, UTC), or removes it when `cron` is null. */
  schedule(name: string, key: string, cron: string | null, data: object): Promise<void>;
}

/** Every N minutes as cron (N ≥ 1), for interval settings such as the fee fill-in. */
export function everyMinutesCron(minutes: number): string {
  if (minutes < 60) return `*/${minutes} * * * *`;
  const hours = Math.max(1, Math.round(minutes / 60));
  return hours >= 24 ? "0 3 * * *" : `0 */${hours} * * *`;
}
