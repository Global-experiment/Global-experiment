import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { CLOCK } from "../common/clock/clock.js";
import { expertiseDomains, expertiseFields, expertiseItems } from "../expertise/expertise.schema.js";
import { organizationExpertise, organizations } from "../organizations/organizations.schema.js";
import { signedInAdmin, type SignedInAdmin } from "../testing/admin-session.js";
import { createTestApp, type TestApp } from "../testing/test-app.js";
import { people, peopleExpertise, peopleOrganizations } from "./people.schema.js";

/** Overdue follow-ups, the expertise rollup filters and completeness — through the API. Test fixtures only. */
describe("people list: follow-ups, rollups, completeness", () => {
  let t: TestApp;
  let admin: SignedInAdmin;

  /** The API's clock, pinned per test. */
  let now = new Date();
  beforeAll(async () => {
    t = await createTestApp({}, [{ provide: CLOCK, useValue: () => now }]);
    admin = await signedInAdmin(t);
  });
  afterAll(async () => {
    await t.close();
  });
  beforeEach(async () => {
    await t.db.delete(peopleExpertise);
    await t.db.delete(organizationExpertise);
    await t.db.delete(peopleOrganizations);
    await t.db.delete(people);
    await t.db.delete(organizations);
    await t.db.delete(expertiseItems);
    await t.db.delete(expertiseFields);
    await t.db.delete(expertiseDomains);
  });

  const names = async (query: string, resource = "people") =>
    (await admin.get(`/api/admin/${resource}?pageSize=100&sort=name:asc&${query}`).expect(200)).body.items.map((item: { name: string }) => item.name);

  it("overdue = the follow-up (date and time) has passed, not Rejected, not Do not contact", async () => {
    now = new Date("2026-10-14T10:00:00Z");
    await t.db.insert(people).values([
      { name: "Overdue", nextFollowupAt: new Date("2026-10-13T07:00:00Z"), stateKey: "contacted" },
      { name: "Overdue, no state", nextFollowupAt: new Date("2026-09-14T07:00:00Z") },
      { name: "Rejected", nextFollowupAt: new Date("2026-10-11T07:00:00Z"), stateKey: "rejected" },
      { name: "Do not contact", nextFollowupAt: new Date("2026-10-11T07:00:00Z"), doNotContact: true },
      { name: "Due later today", nextFollowupAt: new Date("2026-10-14T15:00:00Z") },
      { name: "Later", nextFollowupAt: new Date("2026-10-19T07:00:00Z") },
      { name: "No date" },
    ]);
    expect(await names("filter=follow_up:is:overdue")).toEqual(["Overdue", "Overdue, no state"]);
    const all = (await admin.get("/api/admin/people?pageSize=100&sort=name:asc").expect(200)).body.items as { name: string; followUpOverdue: boolean }[];
    expect(all.filter((person) => person.followUpOverdue).map((person) => person.name)).toEqual(["Overdue", "Overdue, no state"]);
    await admin.get("/api/admin/people?filter=follow_up:is:soon").expect(400);
  });

  it("a follow-up becomes overdue the moment its time passes, whatever the time zone", async () => {
    await t.db.insert(people).values([
      { name: "Due at 9:00 Zurich", nextFollowupAt: new Date("2026-10-14T07:00:00Z") },
      { name: "Due tomorrow", nextFollowupAt: new Date("2026-10-15T07:00:00Z") },
    ]);
    now = new Date("2026-10-14T06:59:00Z");
    expect(await names("filter=follow_up:is:overdue")).toEqual([]);
    now = new Date("2026-10-14T07:01:00Z");
    expect(await names("filter=follow_up:is:overdue")).toEqual(["Due at 9:00 Zurich"]);
    const [person] = (await admin.get("/api/admin/people?sort=name:asc").expect(200)).body.items as { name: string; followUpOverdue: boolean }[];
    expect(person).toMatchObject({ name: "Due at 9:00 Zurich", followUpOverdue: true });
  });

  it("filters by expertise field or domain through the rollup (people link only to Expertise items)", async () => {
    const [government] = await t.db.insert(expertiseDomains).values({ name: "Government" }).returning();
    const [science] = await t.db.insert(expertiseDomains).values({ name: "Science" }).returning();
    const [participation] = await t.db.insert(expertiseFields).values({ name: "Participation", domainId: government!.id }).returning();
    const [administration] = await t.db.insert(expertiseFields).values({ name: "Administration", domainId: government!.id }).returning();
    const [physics] = await t.db.insert(expertiseFields).values({ name: "Physics", domainId: science!.id }).returning();
    const [assemblies, procurement, optics] = await t.db
      .insert(expertiseItems)
      .values([
        { name: "Citizen assemblies", fieldId: participation!.id },
        { name: "Procurement", fieldId: administration!.id },
        { name: "Optics", fieldId: physics!.id },
      ])
      .returning();
    const [ada, bo, cleo] = await t.db.insert(people).values([{ name: "Ada" }, { name: "Bo" }, { name: "Cleo" }]).returning();
    await t.db.insert(peopleExpertise).values([
      { personId: ada!.id, expertiseId: assemblies!.id },
      { personId: bo!.id, expertiseId: procurement!.id },
      { personId: cleo!.id, expertiseId: optics!.id },
    ]);
    expect(await names(`filter=expertise_field:is:${participation!.id}`)).toEqual(["Ada"]);
    expect(await names(`filter=expertise_domain:is:${government!.id}`)).toEqual(["Ada", "Bo"]);
    expect(await names(`filter=expertise_domain:is:${science!.id}&filter=expertise_field:is:${participation!.id}`)).toEqual([]); // AND across fields
    expect(await names(`filter=expertise_field:is:${participation!.id}&filter=expertise_field:is:${physics!.id}`)).toEqual(["Ada", "Cleo"]); // OR within one
  });

  it("people completeness: State, Source, Description, Expertise — in the record and as a filter", async () => {
    const [domain] = await t.db.insert(expertiseDomains).values({ name: "D" }).returning();
    const [field] = await t.db.insert(expertiseFields).values({ name: "F", domainId: domain!.id }).returning();
    const [item] = await t.db.insert(expertiseItems).values({ name: "I", fieldId: field!.id }).returning();
    const [complete] = await t.db
      .insert(people)
      .values([
        { name: "Complete", stateKey: "sourced", sourceKey: "candide", description: "Met at the assembly." },
        { name: "Bare" },
      ])
      .returning();
    await t.db.insert(peopleExpertise).values({ personId: complete!.id, expertiseId: item!.id });

    const all = (await admin.get("/api/admin/people?sort=name:asc").expect(200)).body.items as { name: string; missing: string[] }[];
    expect(all.map((person) => [person.name, person.missing])).toEqual([
      ["Bare", ["State", "Source", "Description", "Expertise"]],
      ["Complete", []],
    ]);
    expect(await names("filter=completeness:is:incomplete")).toEqual(["Bare"]);
    expect(await names("filter=completeness:is:complete")).toEqual(["Complete"]);
    expect(await names("filter=completeness:is:complete&filter=completeness:is:incomplete")).toEqual(["Bare", "Complete"]);
  });

  it("organization completeness: Description, Website, Email, Wise recipient ID, Expertise", async () => {
    await t.db.insert(organizations).values([
      { name: "Partial", description: "Water access.", website: "https://partial.ch" },
      { name: "Empty" },
    ]);
    const all = (await admin.get("/api/admin/organizations?sort=name:asc").expect(200)).body.items as { name: string; missing: string[] }[];
    expect(all.map((organization) => [organization.name, organization.missing])).toEqual([
      ["Empty", ["Description", "Website", "Email", "Wise recipient ID", "Expertise"]],
      ["Partial", ["Email", "Wise recipient ID", "Expertise"]],
    ]);
    expect(await names("filter=completeness:is:complete", "organizations")).toEqual([]);
  });
});
