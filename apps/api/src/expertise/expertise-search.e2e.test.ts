import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { people, peopleExpertise } from "../people/people.schema.js";
import { signedInAdmin, type SignedInAdmin } from "../testing/admin-session.js";
import { createTestApp, type TestApp } from "../testing/test-app.js";
import { expertiseDomains, expertiseFields, expertiseItems, expertiseTeams } from "./expertise.schema.js";

/** GET /api/admin/expertise/search — the picker's server-side search. Test fixtures only. */
describe("expertise search API", () => {
  let t: TestApp;
  let admin: SignedInAdmin;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    t = await createTestApp();
    admin = await signedInAdmin(t);
    const [domain] = await t.db.insert(expertiseDomains).values({ name: "Government", stableId: "domain.07.government", statusKey: "active" }).returning();
    const [participation] = await t.db
      .insert(expertiseFields)
      .values({ name: "Participation", domainId: domain!.id, stableId: "field.07.02.participation", statusKey: "active" })
      .returning();
    const [administration] = await t.db
      .insert(expertiseFields)
      .values({ name: "Administration", domainId: domain!.id, stableId: "field.07.05.administration", statusKey: "active" })
      .returning();
    const items = await t.db
      .insert(expertiseItems)
      .values([
        { name: "Citizen assemblies", fieldId: participation!.id, stableId: "07.02.citizen_assemblies", statusKey: "active" },
        { name: "Assembly facilitation", fieldId: participation!.id, stableId: "07.02.assembly_facilitation", statusKey: "active" },
        { name: "Participatory budgeting", fieldId: participation!.id, stableId: "07.02.participatory_budgeting", statusKey: "active" },
        { name: "Deliberation", fieldId: participation!.id, stableId: "07.02.deliberation", statusKey: "proposed" },
        { name: "Petitions", fieldId: participation!.id, stableId: "07.02.petitions", statusKey: "deprecated" },
        ...Array.from({ length: 25 }, (_, n) => ({
          name: `Skill ${String(n + 1).padStart(2, "0")}`,
          fieldId: administration!.id,
          stableId: `07.05.skill_${n + 1}`,
          statusKey: "active",
        })),
      ])
      .returning();
    for (const item of items) ids[item.name] = item.id;
    await t.db.insert(expertiseTeams).values([
      { expertiseId: ids["Citizen assemblies"]!, teamKey: "moderation" },
      { expertiseId: ids["Citizen assemblies"]!, teamKey: "communication" },
    ]);
  });
  afterAll(async () => {
    await t.close();
  });

  const search = async (query: string) => (await admin.get(`/api/admin/expertise/search?${query}`).expect(200)).body;
  const names = async (query: string) => (await search(query)).items.map((item: { name: string }) => item.name);

  it("requires a session", async () => {
    await request(t.app.getHttpServer()).get("/api/admin/expertise/search?q=citizen").expect(401);
  });

  it("ranks exact name, then name prefix, then word prefix, then other matches", async () => {
    expect((await names("q=citizen%20assemblies"))[0]).toBe("Citizen assemblies");
    expect(await names("q=assembl")).toEqual(["Assembly facilitation", "Citizen assemblies"]);
    // Stable ID only (the name doesn't contain it).
    expect(await names("q=07.02.citizen")).toEqual(["Citizen assemblies"]);
    // Field name: everything Active in "Participation".
    expect(await names("q=participation")).toEqual(["Assembly facilitation", "Citizen assemblies", "Participatory budgeting"]);
  });

  it("returns the full path, team chips (in team order), status and selectability", async () => {
    const [item] = (await search("q=citizen%20assemblies")).items;
    expect(item).toEqual({
      id: ids["Citizen assemblies"],
      name: "Citizen assemblies",
      stableId: "07.02.citizen_assemblies",
      status: { key: "active", label: "Active" },
      field: { id: expect.any(String), name: "Participation" },
      domain: { id: expect.any(String), name: "Government" },
      path: "Government > Participation > Citizen assemblies",
      teams: [
        { key: "communication", label: "Communication" },
        { key: "moderation", label: "Moderation" },
      ],
      selectable: true,
    });
  });

  it("only offers Active items by default; includeInactive adds Proposed/Deprecated as not selectable", async () => {
    expect(await names("q=deliberation")).toEqual([]);
    const inactive = (await search("q=07.02&includeInactive=true&pageSize=50")).items as { name: string; selectable: boolean; status: { key: string } }[];
    expect(inactive.filter((item) => !item.selectable).map((item) => [item.name, item.status.key])).toEqual([
      ["Deliberation", "proposed"],
      ["Petitions", "deprecated"],
    ]);
  });

  it("paginates with a stable order and a total", async () => {
    const pages = await Promise.all([1, 2, 3].map((page) => search(`q=skill&pageSize=10&page=${page}`)));
    expect(pages.map((page) => page.total)).toEqual([25, 25, 25]);
    expect(pages.map((page) => page.items.length)).toEqual([10, 10, 5]);
    const all = pages.flatMap((page) => page.items.map((item: { name: string }) => item.name));
    expect(new Set(all).size).toBe(25);
    expect(all[0]).toBe("Skill 01");
    await admin.get("/api/admin/expertise/search?pageSize=500").expect(400);
  });

  it("escapes LIKE wildcards in the query", async () => {
    // Unescaped, "%" would match everything and "skill_1_" every skill_1x.
    expect(await names("q=%25")).toEqual([]);
    expect(await names("q=skill_1_")).toEqual([]);
  });

  it("linked expertise carries its status, so non-Active links can be shown greyed out", async () => {
    const [person] = await t.db.insert(people).values({ name: "Linked" }).returning();
    await t.db.insert(peopleExpertise).values({ personId: person!.id, expertiseId: ids.Petitions! });
    const fetched = (await admin.get(`/api/admin/people/${person!.id}`).expect(200)).body;
    expect(fetched.expertise).toEqual([
      expect.objectContaining({ name: "Petitions", stableId: "07.02.petitions", status: { key: "deprecated", label: "Deprecated" } }),
    ]);
  });
});
