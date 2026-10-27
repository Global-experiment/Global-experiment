import { mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Database } from "../common/database/database.module.js";
import { expertiseDomains, expertiseFields, expertiseItems } from "../expertise/expertise.schema.js";
import { organizationExpertise, organizations } from "../organizations/organizations.schema.js";
import { people, peopleExpertise, peopleOrganizations } from "../people/people.schema.js";
import { FIXTURE_ORGANIZATIONS, FIXTURE_PEOPLE, FIXTURE_TAXONOMY } from "../testing/fixtures/directory-fixtures.js";
import { loadDirectoryFixtures } from "../testing/fixtures/load-directory-fixtures.js";
import { createTestDatabase } from "../testing/test-app.js";
import { backupRefusal, formatPlan, parsePurgeArgs, planDemoPurge, purgeDemoData } from "./demo-data-purge.js";

describe("demo data purge", () => {
  let db: Database;
  let close: () => Promise<void>;

  beforeAll(async () => {
    ({ db, close } = await createTestDatabase());
  });
  afterAll(async () => {
    await close();
  });
  beforeEach(async () => {
    await db.delete(peopleExpertise);
    await db.delete(peopleOrganizations);
    await db.delete(organizationExpertise);
    await db.delete(people);
    await db.delete(organizations);
    await db.delete(expertiseItems);
    await db.delete(expertiseFields);
    await db.delete(expertiseDomains);
  });

  /** Real records, none of which may ever be touched — including ones that merely look similar. */
  async function insertRealRecords() {
    const [domain] = await db.insert(expertiseDomains).values({ name: "Civic participation", stableId: "domain.07.civic_participation" }).returning();
    const [field] = await db
      .insert(expertiseFields)
      .values({ name: "Participatory democracy", domainId: domain!.id, stableId: "field.07.02.participatory_democracy" })
      .returning();
    const [item] = await db
      .insert(expertiseItems)
      .values({ name: "Participatory budgeting", fieldId: field!.id, stableId: "07.02.participatory_budgeting" })
      .returning();
    const [person] = await db
      .insert(people)
      .values({ name: "Real Person", email: "real@example.com", website: "https://notexample.org", description: "Met at a demo day" })
      .returning();
    const [organization] = await db
      .insert(organizations)
      .values({ name: "Demo Day Association", email: "contact@demo-day.ch", description: "Organises sample-size studies" })
      .returning();
    await db.insert(peopleExpertise).values({ personId: person!.id, expertiseId: item!.id });
    return { domain: domain!, field: field!, item: item!, person: person!, organization: organization! };
  }

  it("finds every demo marker: seed ids, example.org, Fictional sample, DEMO-", async () => {
    await insertRealRecords();
    await db.insert(people).values([
      { name: "Imported Sample", email: "imported@sub.example.org" },
      { name: "Story person", description: "Fictional sample — do not contact" },
      { name: "DEMO-PER-3 Placeholder" },
      { name: "Website only", website: "https://someone.example.org/profile" },
    ]);
    await db.insert(organizations).values([
      { name: "Sample NGO", email: "info@example.org" },
      { name: "Story org", description: "A fictional sample organisation." },
    ]);
    await db.insert(expertiseDomains).values({ name: "DEMO-domain" });

    const plan = await planDemoPurge(db);
    const byName = Object.fromEntries(plan.delete.map((row) => [row.name, row.reasons]));
    expect(byName).toEqual({
      "Imported Sample": ["example.org email"],
      "Story person": ['"Fictional sample" text'],
      "DEMO-PER-3 Placeholder": ["DEMO- prefix"],
      "Website only": ["example.org website"],
      "Sample NGO": ["example.org email"],
      "Story org": ['"Fictional sample" text'],
      "DEMO-domain": ["DEMO- prefix (name or Stable ID)"],
    });
    expect(plan.skip).toEqual([]);
  });

  it("recognises the whole former demo dataset by its seed ids", async () => {
    await loadDirectoryFixtures(db);
    const plan = await planDemoPurge(db);
    const count = (kind: string) => plan.delete.filter((row) => row.kind === kind).length;
    expect(count("person")).toBe(FIXTURE_PEOPLE.length);
    expect(count("organization")).toBe(FIXTURE_ORGANIZATIONS.length);
    expect(count("domain")).toBe(FIXTURE_TAXONOMY.domains.length);
    expect(count("field")).toBe(FIXTURE_TAXONOMY.domains.flatMap((d) => d.fields).length);
    expect(count("expertise")).toBe(FIXTURE_TAXONOMY.domains.flatMap((d) => d.fields.flatMap((f) => f.items)).length);
    expect(plan.delete.every((row) => row.reasons.includes("former demo seed id (de000000-…)"))).toBe(true);
  });

  it("dry run changes nothing; the confirmed purge deletes exactly the plan and never a real record", async () => {
    const real = await insertRealRecords();
    await loadDirectoryFixtures(db);
    const before = { people: await db.$count(people), organizations: await db.$count(organizations) };

    const plan = await planDemoPurge(db);
    expect({ people: await db.$count(people), organizations: await db.$count(organizations) }).toEqual(before);

    const applied = await purgeDemoData(db);
    expect(applied.delete.length).toBe(plan.delete.length);
    expect((await db.select({ id: people.id }).from(people)).map((row) => row.id)).toEqual([real.person.id]);
    expect((await db.select({ id: organizations.id }).from(organizations)).map((row) => row.id)).toEqual([real.organization.id]);
    expect((await db.select({ id: expertiseItems.id }).from(expertiseItems)).map((row) => row.id)).toEqual([real.item.id]);
    expect(await db.$count(peopleExpertise)).toBe(1); // the real person's tag

    // Running it again finds nothing.
    expect((await planDemoPurge(db)).delete).toEqual([]);
  });

  it("keeps demo-marked expertise that real records still use, and its parents", async () => {
    const real = await insertRealRecords();
    const [domain] = await db.insert(expertiseDomains).values({ name: "Sample domain", id: "de000000-3000-4000-8000-0000000000aa" }).returning();
    const [field] = await db.insert(expertiseFields).values({ name: "Sample field", domainId: domain!.id, id: "de000000-4000-4000-8000-0000000000aa" }).returning();
    const [item] = await db.insert(expertiseItems).values({ name: "Sample item", fieldId: field!.id, id: "de000000-5000-4000-8000-0000000000aa" }).returning();
    await db.insert(peopleExpertise).values({ personId: real.person.id, expertiseId: item!.id });

    const plan = await planDemoPurge(db);
    expect(plan.delete.filter((row) => ["expertise", "field", "domain"].includes(row.kind))).toEqual([]);
    expect(plan.skip.map((row) => [row.kind, row.keptBecause])).toEqual([
      ["expertise", "still tagged on 1 real people and 0 real organizations"],
      ["field", "still has 1 expertise that stay"],
      ["domain", "still has 1 fields that stay"],
    ]);
    await purgeDemoData(db);
    expect(await db.$count(expertiseItems)).toBe(2);
  });

  it("formats a readable listing with totals", async () => {
    await db.insert(people).values({ name: "Imported Sample", email: "imported@example.org" });
    const text = formatPlan(await planDemoPurge(db), "DRY RUN");
    expect(text).toContain("person — 1 to delete");
    expect(text).toMatch(/ {2}[0-9a-f-]{36} {2}Imported Sample {2}\[example\.org email\]/);
    expect(text).toContain("Total: 1 person, 0 organization, 0 expertise, 0 field, 0 domain; 0 kept.");
  });
});

describe("purge command guards", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });
  const file = (contents: string, ageHours = 0) => {
    const dir = mkdtempSync(join(tmpdir(), "ge-backup-"));
    dirs.push(dir);
    const path = join(dir, "backup.dump");
    writeFileSync(path, contents);
    const time = new Date(Date.now() - ageHours * 3_600_000);
    utimesSync(path, time, time);
    return path;
  };

  it("is a dry run unless --confirm is given", () => {
    expect(parsePurgeArgs([])).toEqual({ confirm: false });
    expect(parsePurgeArgs(["--dry-run"])).toEqual({ confirm: false });
    expect(parsePurgeArgs(["--confirm", "--backup", "/b.dump"])).toEqual({ confirm: true, backup: "/b.dump" });
    expect(parsePurgeArgs(["--confirm", "--backup=/b.dump"])).toEqual({ confirm: true, backup: "/b.dump" });
    expect(() => parsePurgeArgs(["--dry-run", "--confirm"])).toThrow(/can't be combined/);
    expect(() => parsePurgeArgs(["--force"])).toThrow(/Unknown argument/);
  });

  it("requires an existing, non-empty backup file from the last 24 hours", () => {
    expect(backupRefusal(undefined)).toMatch(/--backup <path>/);
    expect(backupRefusal(join(tmpdir(), "ge-no-such-backup.dump"))).toMatch(/doesn't exist/);
    expect(backupRefusal(file(""))).toMatch(/is empty/);
    expect(backupRefusal(file("pg_dump output", 25))).toMatch(/25 hours old/);
    expect(backupRefusal(file("pg_dump output", 1))).toBeUndefined();
  });
});
