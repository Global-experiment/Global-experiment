import { PGlite } from "@electric-sql/pglite";
import { fromPglite, PgBoss } from "pg-boss";
import { afterEach, describe, expect, it } from "vitest";
import { everyMinutesCron } from "./job-queue.js";
import { PgBossJobQueue } from "./pg-boss-queue.js";

/**
 * The pg-boss driver for real (pg-boss's own PGlite adapter): queue
 * creation (also on an existing installation), a job's output, the
 * exclusive policy that keeps imports one at a time, failures, schedules.
 */
const quiet = { info: () => undefined, error: () => undefined };
const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});

async function queueOn(client: PGlite) {
  const queue = new PgBossJobQueue({ db: fromPglite(client), supervise: false } as never, quiet, 0.5);
  cleanup.push(() => queue.stop());
  return queue;
}

const settle = async (queue: PgBossJobQueue, name: string, id: string) => {
  for (let attempt = 0; attempt < 200; attempt++) {
    const job = await queue.get(name, id);
    if (job && job.state !== "queued" && job.state !== "active") return job;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("job didn't settle");
};

describe("PgBossJobQueue (pg-boss on PGlite)", () => {
  it("runs a job, keeps its output, refuses a second job on an exclusive queue meanwhile", async () => {
    const client = new PGlite();
    cleanup.push(() => client.close());
    const queue = await queueOn(client);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    queue.define<{ n: number }, { doubled: number }>(
      "test.exclusive",
      async (data) => {
        await gate;
        return { doubled: data.n * 2 };
      },
      { policy: "exclusive" },
    );
    await queue.start();

    const id = await queue.send("test.exclusive", { n: 21 });
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    // One import at a time: a second one is refused while the first is queued or running.
    expect(await queue.send("test.exclusive", { n: 1 })).toBeNull();
    release();
    const done = await settle(queue, "test.exclusive", id!);
    expect(done).toMatchObject({ state: "completed", data: { n: 21 }, output: { doubled: 42 }, error: null });
    expect(done.completedAt).toBeInstanceOf(Date);
    // Free again once it's done.
    expect(await queue.send("test.exclusive", { n: 2 })).not.toBeNull();
  }, 30_000);

  it("records a failure's message, not a retry storm (retryLimit 0)", async () => {
    const client = new PGlite();
    cleanup.push(() => client.close());
    const queue = await queueOn(client);
    queue.define("test.failing", async () => {
      throw new Error("Notion is down");
    });
    await queue.start();
    const id = await queue.send("test.failing", {});
    const failed = await settle(queue, "test.failing", id!);
    expect(failed).toMatchObject({ state: "failed", output: null, error: "Notion is down" });
  }, 30_000);

  it("starts on an existing installation (queues already there) and keeps schedules by key", async () => {
    const client = new PGlite();
    cleanup.push(() => client.close());
    const first = await queueOn(client);
    first.define("test.scheduled", async () => ({}), { policy: "exclusive" });
    await first.start();
    await first.schedule("test.scheduled", "treasury", "*/15 * * * *", { kind: "treasury" });
    await first.stop();

    const second = await queueOn(client);
    second.define("test.scheduled", async () => ({}), { policy: "exclusive", retryLimit: 1 });
    await second.start();
    const boss = new PgBoss({ db: fromPglite(client), supervise: false, schedule: false } as never);
    cleanup.push(() => boss.stop({ graceful: false }));
    await boss.start();
    expect((await boss.getSchedules("test.scheduled")).map((schedule) => [schedule.key, schedule.cron, schedule.timezone])).toEqual([["treasury", "*/15 * * * *", "UTC"]]);
    expect((await boss.getQueue("test.scheduled"))?.retryLimit).toBe(1);
    await second.schedule("test.scheduled", "treasury", null, {});
    expect(await boss.getSchedules("test.scheduled")).toEqual([]);
  }, 30_000);

  it("turns an interval in minutes into cron", () => {
    expect(everyMinutesCron(15)).toBe("*/15 * * * *");
    expect(everyMinutesCron(120)).toBe("0 */2 * * *");
    expect(everyMinutesCron(24 * 60)).toBe("0 3 * * *");
  });
});
