import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { DEMO_ORGANIZATIONS, DEMO_PEOPLE, DEMO_TAXONOMY } from "./demo-data.js";
import { organizations } from "../organizations/organizations.schema.js";
import { people, peopleExpertise, peopleOrganizations } from "../people/people.schema.js";
import { createTestDatabase } from "../testing/test-app.js";
import type { Database } from "../common/database/database.module.js";
import { demoSeedRefusal, removeDemoData, seedDemoData } from "./seed-demo.js";

describe("demo seed", () => {
  let db: Database;
  let close: () => Promise<void>;

  beforeAll(async () => {
    ({ db, close } = await createTestDatabase());
  });
  afterAll(async () => {
    await close();
  });

  it("loads a realistic dataset and is idempotent", async () => {
    const first = await seedDemoData(db);
    const counts = async () => ({
      people: await db.$count(people),
      organizations: await db.$count(organizations),
      memberships: await db.$count(peopleOrganizations),
      tags: await db.$count(peopleExpertise),
    });
    const afterFirst = await counts();
    expect(afterFirst.people).toBe(first.people);
    expect(afterFirst.people).toBeGreaterThanOrEqual(40);
    expect(afterFirst.memberships).toBeGreaterThan(afterFirst.people / 2);

    await seedDemoData(db);
    expect(await counts()).toEqual(afterFirst);
  });

  it("never touches non-demo rows", async () => {
    await db.insert(people).values({ name: "Real Person" });
    await seedDemoData(db);
    await removeDemoData(db);
    const remaining = await db.select({ name: people.name }).from(people);
    expect(remaining).toEqual([{ name: "Real Person" }]);
  });

  it.each([
    [{ NODE_ENV: "production" }, "postgres://u@h/global_experiment_dev", "production"],
    [{}, "postgres://u@h/global_experiment", "_dev or _test"],
    [{}, "postgres://u@h/prod_db", "_dev or _test"],
  ])("refuses %j %s", (env, url, reason) => {
    expect(demoSeedRefusal(env, url)).toContain(reason);
  });

  it("uses ids the API's strict uuid validation accepts (they're sent back by the admin UI)", () => {
    const ids = [
      ...DEMO_PEOPLE.map((p) => p.id),
      ...DEMO_ORGANIZATIONS.map((o) => o.id),
      ...DEMO_TAXONOMY.domains.flatMap((d) => [d.id, ...d.fields.flatMap((f) => [f.id, ...f.items.map((i) => i.id)])]),
    ];
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(z.uuid().safeParse(id).success, id).toBe(true);
  });

  it("allows local development and test databases", () => {
    expect(demoSeedRefusal({}, "postgres://u@localhost:5433/global_experiment_dev")).toBeUndefined();
    expect(demoSeedRefusal({ NODE_ENV: "test" }, "postgres://u@localhost:5433/global_experiment_test")).toBeUndefined();
  });
});
