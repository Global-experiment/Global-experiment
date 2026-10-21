import { asc, eq, sql } from "drizzle-orm";
import { auditEvents } from "../../audit/audit.schema.js";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Database } from "../../common/database/database.module.js";
import { expertiseDomains, expertiseFields, expertiseItems } from "../../expertise/expertise.schema.js";
import { organizationExpertise, organizations } from "../../organizations/organizations.schema.js";
import { people, peopleExpertise, peopleOrganizations } from "../../people/people.schema.js";
import { createTestDatabase } from "../../testing/test-app.js";
import { ImportRefusedError } from "../import-run.js";
import { importRuns } from "../import.schema.js";
import { formatDirectoryReport, runDirectoryImport } from "./directory-import.js";
import type { DirectorySource, SourceOrganization, SourcePerson } from "./directory-source.js";

// Test fixtures only — written to this test's in-process database, never elsewhere.
const page = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, "0")}`;
const EXPERTISE_PAGE = page(900);
const org = (n: number, name: string, extra: Partial<SourceOrganization> = {}): SourceOrganization => ({
  kind: "organization",
  pageId: page(n),
  createdTime: `2026-10-14T08:00:${String(n % 60).padStart(2, "0")}.000Z`,
  name,
  number: n,
  description: `${name} works on civic infrastructure.`,
  website: `https://org${n}.ch`,
  email: `team@org${n}.ch`,
  wiseRecipientId: `W-${n}`,
  peoplePageIds: [],
  expertisePageIds: [],
  expensesCount: 0,
  missingRequired: [],
  ...extra,
});
const person = (n: number, name: string, extra: Partial<SourcePerson> = {}): SourcePerson => ({
  kind: "person",
  pageId: page(100 + n),
  createdTime: `2026-10-14T09:00:${String(n % 60).padStart(2, "0")}.000Z`,
  name,
  number: n,
  state: "Collaborating",
  source: "AI",
  personalNote: "Met at the assembly.",
  doNotContact: false,
  email: `person${n}@ngo.ch`,
  phone: null,
  website: null,
  linkedin: null,
  x: null,
  otherContact: null,
  wiseRecipientId: null,
  nextFollowupAt: "2026-11-03",
  organizationPageIds: [],
  expertisePageIds: [],
  expensesCount: 0,
  accessGrantsCount: 0,
  missingRequired: [],
  ...extra,
});
const layout = { names: {}, required: [], unread: [], absent: [] };
const realSource = (): DirectorySource => ({
  organizations: [org(1, "Civic Lab", { peoplePageIds: [page(102)] }), org(2, "Water Trust")],
  people: [
    person(1, "Amina Diallo", { organizationPageIds: [page(1), page(2)], expertisePageIds: [EXPERTISE_PAGE], doNotContact: true }),
    person(2, "Bruno Keller"),
  ],
  layouts: { people: layout, organizations: layout },
});

describe("directory import (database)", () => {
  let db: Database;
  let close: () => Promise<void>;
  let expertiseId: string;
  const options = { triggeredBy: "test" };

  beforeAll(async () => {
    ({ db, close } = await createTestDatabase());
  });
  afterAll(async () => {
    await close();
  });
  beforeEach(async () => {
    await db.delete(peopleExpertise);
    await db.delete(organizationExpertise);
    await db.delete(peopleOrganizations);
    await db.delete(people);
    await db.delete(organizations);
    await db.delete(expertiseItems);
    await db.delete(expertiseFields);
    await db.delete(expertiseDomains);
    await db.delete(importRuns);
    // The audit log is append-only (a trigger refuses deletes): each test gets a log it can read from a clean point.
    await db.execute(sql`alter table audit_events disable trigger audit_events_no_update_or_delete`);
    await db.delete(auditEvents);
    await db.execute(sql`alter table audit_events enable trigger audit_events_no_update_or_delete`);
    // Each test starts numbering from PER-1 / ORG-1 (deleting rows doesn't rewind identity sequences).
    await db.execute(sql`alter table people alter column person_number restart with 1`);
    await db.execute(sql`alter table organizations alter column org_number restart with 1`);
    const [domain] = await db.insert(expertiseDomains).values({ name: "Government", notionPageId: page(700) }).returning();
    const [field] = await db.insert(expertiseFields).values({ name: "Participation", domainId: domain!.id, notionPageId: page(800) }).returning();
    const [item] = await db.insert(expertiseItems).values({ name: "Citizen assemblies", fieldId: field!.id, notionPageId: EXPERTISE_PAGE }).returning();
    expertiseId = item!.id;
  });

  const peopleRows = () => db.select().from(people).orderBy(asc(people.personNumber));

  it("dry run writes only the import_runs record", async () => {
    const result = await runDirectoryImport(db, realSource(), { ...options, apply: false });
    expect(result.counts).toMatchObject({ organization: { created: 2 }, person: { created: 2 }, links: { personOrganization: { added: 3 } } });
    expect(await db.$count(people)).toBe(0);
    expect((await db.select().from(importRuns)).map((run) => [run.kind, run.mode])).toEqual([["directory", "dry_run"]]);
  });

  it("applies records, Notion numbers, vocabularies, links and expertise", async () => {
    const result = await runDirectoryImport(db, realSource(), { ...options, apply: true });
    expect(result.counts.changes).toBe(2 + 2 + 3 + 1);

    expect((await peopleRows()).map((p) => ({ n: p.personNumber, name: p.name, state: p.stateKey, source: p.sourceKey, dnc: p.doNotContact, next: p.nextFollowupAt?.toISOString() }))).toEqual([
      // Notion's date alone: 09:00 in Zurich (CET after Oct 25: 08:00 UTC).
      { n: 1, name: "Amina Diallo", state: "collaborating", source: "ai", dnc: true, next: "2026-11-03T08:00:00.000Z" },
      { n: 2, name: "Bruno Keller", state: "collaborating", source: "ai", dnc: false, next: "2026-11-03T08:00:00.000Z" },
    ]);
    expect((await db.select().from(organizations).orderBy(asc(organizations.orgNumber))).map((o) => [o.orgNumber, o.name, o.wiseRecipientId])).toEqual([
      [1, "Civic Lab", "W-1"],
      [2, "Water Trust", "W-2"],
    ]);
    expect(await db.$count(peopleOrganizations)).toBe(3);
    expect(await db.select({ expertiseId: peopleExpertise.expertiseId }).from(peopleExpertise)).toEqual([{ expertiseId }]);

    // The sequence moved past Notion's numbers: the admin's next person gets PER-3, not PER-1.
    const [next] = await db.insert(people).values({ name: "Created in the admin" }).returning({ n: people.personNumber });
    expect(next!.n).toBe(3);
    expect(formatDirectoryReport(result)).toContain("person ↔ organization links: 3 added, 0 removed");
  });

  it("logs every imported record ('Automation', Notion · People) and each later change, old → new", async () => {
    await runDirectoryImport(db, realSource(), { ...options, apply: true });
    const events = async (action: string) => db.select().from(auditEvents).where(eq(auditEvents.action, action));
    const imported = await events("imported");
    expect(imported.filter((event) => event.entityType === "person").map((event) => event.meta.label).sort()).toEqual(["PER-1 · Amina Diallo", "PER-2 · Bruno Keller"]);
    expect(imported.filter((event) => event.entityType === "organization")).toHaveLength(2);
    expect(imported[0]).toMatchObject({ actorType: "automation", actorLabel: "Automation", actorId: null, source: "import" });
    expect(imported.find((event) => event.entityType === "person")!.meta.importSource).toBe("Notion · People");
    // The run itself is logged.
    expect((await db.select().from(auditEvents).where(eq(auditEvents.entityType, "import_run"))).map((event) => event.meta.label)).toEqual(["directory import · apply"]);

    const changed = realSource();
    changed.people[1] = { ...changed.people[1]!, name: "Bruno K. Keller", website: "https://bruno.example" };
    await runDirectoryImport(db, changed, { ...options, apply: true });
    const [updated] = await events("updated");
    expect(updated).toMatchObject({ entityType: "person", actorType: "automation", source: "import", meta: { label: "PER-2 · Bruno K. Keller", importSource: "Notion · People" } });
    expect(updated!.changes.map((change) => [change.field, change.before, change.after])).toEqual([
      ["name", "Bruno Keller", "Bruno K. Keller"],
      ["website", null, "https://bruno.example"],
    ]);
  });

  it("is idempotent: a second run reports 0 changes and writes nothing", async () => {
    await runDirectoryImport(db, realSource(), { ...options, apply: true });
    const before = await db.select({ id: people.id, updatedAt: people.updatedAt }).from(people);
    const second = await runDirectoryImport(db, realSource(), { ...options, apply: true });
    expect(second.counts.changes).toBe(0);
    expect(second.counts).toMatchObject({ organization: { unchanged: 2 }, person: { unchanged: 2 } });
    expect(formatDirectoryReport(second)).toContain("Result: 0 changes — the database already matches Notion.");
    expect(await db.select({ id: people.id, updatedAt: people.updatedAt }).from(people)).toEqual(before);
  });

  it("syncs links: Notion removals are applied between imported records; manual links stay", async () => {
    await runDirectoryImport(db, realSource(), { ...options, apply: true });
    const [amina] = await db.select().from(people).where(eq(people.name, "Amina Diallo"));
    const [manualOrg] = await db.insert(organizations).values({ name: "Admin-made org" }).returning();
    await db.insert(peopleOrganizations).values({ personId: amina!.id, organizationId: manualOrg!.id });

    const edited = realSource();
    edited.people[0]!.organizationPageIds = [page(1)]; // removed from Water Trust in Notion
    edited.people[0]!.expertisePageIds = []; // expertise removed in Notion
    const result = await runDirectoryImport(db, edited, { ...options, apply: true });
    expect(result.counts.links).toMatchObject({ personOrganization: { added: 0, removed: 1 }, personExpertise: { added: 0, removed: 1 } });

    const links = await db
      .select({ organization: organizations.name })
      .from(peopleOrganizations)
      .innerJoin(organizations, eq(organizations.id, peopleOrganizations.organizationId))
      .where(eq(peopleOrganizations.personId, amina!.id))
      .orderBy(asc(organizations.name));
    expect(links.map((link) => link.organization)).toEqual(["Admin-made org", "Civic Lab"]);
    expect(await db.$count(peopleExpertise)).toBe(0);
  });

  it("flags a number another row holds and lets the database assign one; numbers can also swap", async () => {
    await db.insert(people).values({ name: "Admin-made", personNumber: 2 });
    const result = await runDirectoryImport(db, realSource(), { ...options, apply: true });
    expect(result.plan.issues.filter((i) => i.code === "number_taken").map((i) => i.name)).toEqual(["Bruno Keller"]);
    expect((await peopleRows()).map((p) => [p.personNumber, p.name])).toEqual([
      [1, "Amina Diallo"],
      [2, "Admin-made"],
      [3, "Bruno Keller"],
    ]);

    // Notion swaps the two numbers of imported people: the unique index never sees a duplicate.
    await db.delete(people).where(eq(people.name, "Admin-made"));
    const swapped = realSource();
    swapped.people[0]!.number = 3;
    swapped.people[1]!.number = 1;
    await runDirectoryImport(db, swapped, { ...options, apply: true });
    expect((await peopleRows()).map((p) => [p.personNumber, p.name])).toEqual([
      [1, "Bruno Keller"],
      [3, "Amina Diallo"],
    ]);
  });

  it("is all or nothing: a failure rolls everything back and is recorded", async () => {
    await expect(
      runDirectoryImport(db, realSource(), {
        ...options,
        apply: true,
        beforeCommit: async () => {
          throw new Error("simulated failure before commit");
        },
      }),
    ).rejects.toThrow("simulated failure before commit");
    expect(await db.$count(people)).toBe(0);
    expect(await db.$count(organizations)).toBe(0);
    expect(await db.$count(peopleOrganizations)).toBe(0);
    expect((await db.select().from(importRuns)).map((run) => run.mode)).toEqual(["failed"]);
  });

  it("refuses --apply when Notion holds only demo records, and writes nothing", async () => {
    const demoOnly: DirectorySource = {
      organizations: [org(20, "Horizon Open Tools", { email: "org20@example.org", wiseRecipientId: "DEMO-RECIPIENT-ORG-20" })],
      people: [person(3, "Sofia Duarte", { email: "person3@example.org", organizationPageIds: [page(20)] })],
      layouts: { people: layout, organizations: layout },
    };
    const dry = await runDirectoryImport(db, demoOnly, { ...options, apply: false });
    expect(dry.counts).toMatchObject({ organization: { demo: 1, created: 0 }, person: { demo: 1, created: 0 } });
    expect(formatDirectoryReport(dry)).toContain("Refusing to apply: all 2 Notion records");

    const error = await runDirectoryImport(db, demoOnly, { ...options, apply: true }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ImportRefusedError);
    expect(await db.$count(people)).toBe(0);
    const runs = await db.select().from(importRuns).orderBy(asc(importRuns.startedAt));
    expect(runs.map((run) => run.mode)).toEqual(["dry_run", "failed"]);
    expect((runs[1]!.issues as { code: string }[])[0]!.code).toBe("apply_refused");
  });
});
