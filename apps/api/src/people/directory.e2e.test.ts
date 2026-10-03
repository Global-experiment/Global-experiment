import { sql } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { expertiseDomains, expertiseFields, expertiseItems } from "../expertise/expertise.schema.js";
import { organizationExpertise, organizations } from "../organizations/organizations.schema.js";
import { signedInAdmin, type SignedInAdmin } from "../testing/admin-session.js";
import { createTestApp, TEST_ORIGIN, type TestApp } from "../testing/test-app.js";
import { people, peopleExpertise, peopleOrganizations } from "./people.schema.js";

/**
 * People / Organizations / Expertise through the real HTTP stack (guards,
 * validation pipe, error filter) against migrated PostgreSQL — PGlite by
 * default, a real PostgreSQL 17 server under `npm run api:test:pg`.
 */
describe("native directory API", () => {
  let t: TestApp;
  let admin: SignedInAdmin;
  const anonymous = () => request(t.app.getHttpServer());

  beforeAll(async () => {
    t = await createTestApp({ TRUST_PROXY_HOPS: "1" });
    admin = await signedInAdmin(t);
  });
  afterAll(async () => {
    await t.close();
  });
  beforeEach(async () => {
    await t.db.delete(peopleExpertise);
    await t.db.delete(peopleOrganizations);
    await t.db.delete(organizationExpertise);
    await t.db.delete(people);
    await t.db.delete(organizations);
    await t.db.delete(expertiseItems);
    await t.db.delete(expertiseFields);
    await t.db.delete(expertiseDomains);
  });

  async function taxonomy() {
    const domain = (await admin.post("/api/admin/expertise/domains", { name: "Technology" }).expect(201)).body;
    const field = (await admin.post("/api/admin/expertise/fields", { name: "Software", domainId: domain.id }).expect(201)).body;
    const web = (await admin.post("/api/admin/expertise/items", { name: "Web development", fieldId: field.id }).expect(201)).body;
    const backend = (await admin.post("/api/admin/expertise/items", { name: "Backend development", fieldId: field.id }).expect(201)).body;
    return { domain, field, web, backend };
  }

  const createPerson = async (body: object) => (await admin.post("/api/admin/people", body).expect(201)).body;
  const createOrganization = async (body: object) => (await admin.post("/api/admin/organizations", body).expect(201)).body;

  describe("auth protection", () => {
    it.each([
      ["get", "/api/admin/people"],
      ["get", "/api/admin/people/options"],
      ["get", "/api/admin/organizations"],
      ["get", "/api/admin/expertise/tree"],
    ])("%s %s requires a session", async (_method, path) => {
      const res = await anonymous().get(path).expect(401);
      expect(res.body.error.code).toBe("unauthenticated");
    });

    it("refuses anonymous writes before touching data", async () => {
      await anonymous().post("/api/admin/people").set("origin", TEST_ORIGIN).send({ name: "X" }).expect(401);
      expect(await t.db.$count(people)).toBe(0);
    });

    it("refuses cross-site writes even with a session", async () => {
      await admin.post("/api/admin/people", { name: "X" }).set("origin", "https://evil.example").expect(403);
    });
  });

  describe("people CRUD", () => {
    it("creates, reads and updates a person with every native field", async () => {
      const created = await createPerson({
        name: "  Ada Example  ",
        stateKey: "sourced",
        sourceKey: "candide",
        personalNote: "Met at a civic tech meetup",
        email: "ada@example.org",
        linkedin: "linkedin.com/in/ada-example",
        doNotContact: false,
      });
      expect(created).toMatchObject({
        name: "Ada Example",
        state: { key: "sourced", label: "Sourced" },
        source: { key: "candide", label: "Candide" },
        email: "ada@example.org",
        phone: null,
        organizations: [],
        expertise: [],
      });
      expect(created.id).toMatch(/^[0-9a-f-]{36}$/);

      const fetched = (await admin.get(`/api/admin/people/${created.id}`).expect(200)).body;
      expect(fetched).toEqual(created);

      const updated = (
        await admin
          .patch(`/api/admin/people/${created.id}`, {
            stateKey: "contacted",
            phone: "+41 00 000 00 00",
            personalNote: "",
            lastFollowupAt: "2026-09-01T10:00:00.000Z",
          })
          .expect(200)
      ).body;
      expect(updated.state).toEqual({ key: "contacted", label: "Contacted" });
      expect(updated.personalNote).toBeNull();
      expect(updated.lastFollowupAt).toBe("2026-09-01T10:00:00.000Z");
      expect(updated.name).toBe("Ada Example");
      expect(new Date(updated.updatedAt).getTime()).toBeGreaterThanOrEqual(new Date(created.updatedAt).getTime());
    });

    it("returns 404 for an unknown person and 400 for a malformed id", async () => {
      await admin.get("/api/admin/people/00000000-0000-4000-8000-000000000000").expect(404);
      const res = await admin.get("/api/admin/people/not-a-uuid").expect(400);
      expect(res.body.error.code).toBe("validation_failed");
    });

    it("validates input and names the offending field", async () => {
      const cases: [object, string][] = [
        [{}, "name"],
        [{ name: "   " }, "name"],
        [{ name: "X", email: "not-an-email" }, "email"],
        [{ name: "X", stateKey: "Not A Key" }, "stateKey"],
        [{ name: "X", unknownField: 1 }, ""],
        [{ name: "X", lastFollowupAt: "yesterday" }, "lastFollowupAt"],
        [{ name: "X".repeat(201) }, "name"],
      ];
      for (const [body, path] of cases) {
        const res = await admin.post("/api/admin/people", body).expect(400);
        expect(res.body.error.code).toBe("validation_failed");
        if (path) expect(res.body.error.details.issues.map((i: { path: string }) => i.path)).toContain(path);
      }
    });

    it("refuses state/source keys that aren't in the vocabulary", async () => {
      const res = await admin.post("/api/admin/people", { name: "X", stateKey: "archived" }).expect(400);
      expect(res.body.error.details.issues).toEqual([{ path: "stateKey", message: "Unknown state." }]);
    });

    it("lists the vocabulary from the database", async () => {
      const res = await admin.get("/api/admin/people/options").expect(200);
      expect(res.body.states.map((s: { key: string }) => s.key)).toEqual(["sourced", "contacted", "collaborating"]);
      expect(res.body.sources.map((s: { key: string }) => s.key)).toContain("candide");
    });

    it("keeps duplicates visible instead of merging them", async () => {
      await createPerson({ name: "Same Name", email: "same@example.org" });
      await createPerson({ name: "Same Name", email: "same@example.org" });
      const res = await admin.get("/api/admin/people?search=same").expect(200);
      expect(res.body.total).toBe(2);
    });
  });

  describe("relationships", () => {
    it("assigns and removes organizations and expertise on a person", async () => {
      const { web, backend } = await taxonomy();
      const lab = await createOrganization({ name: "Example Lab" });
      const coop = await createOrganization({ name: "Civic Coop" });
      const person = await createPerson({ name: "Grace Example", organizationIds: [lab.id], expertiseIds: [web.id] });
      expect(person.organizations).toEqual([{ id: lab.id, name: "Example Lab" }]);
      expect(person.expertise).toEqual([
        { id: web.id, name: "Web development", field: { id: expect.any(String), name: "Software" }, domain: { id: expect.any(String), name: "Technology" } },
      ]);

      await admin.put(`/api/admin/people/${person.id}/organizations/${coop.id}`).expect(204);
      await admin.put(`/api/admin/people/${person.id}/organizations/${coop.id}`).expect(204); // idempotent
      await admin.put(`/api/admin/people/${person.id}/expertise/${backend.id}`).expect(204);
      let fetched = (await admin.get(`/api/admin/people/${person.id}`)).body;
      expect(fetched.organizations.map((o: { name: string }) => o.name)).toEqual(["Civic Coop", "Example Lab"]);
      expect(fetched.expertise.map((e: { name: string }) => e.name)).toEqual(["Backend development", "Web development"]);

      await admin.delete(`/api/admin/people/${person.id}/organizations/${lab.id}`).expect(204);
      await admin.delete(`/api/admin/people/${person.id}/expertise/${web.id}`).expect(204);
      fetched = (await admin.get(`/api/admin/people/${person.id}`)).body;
      expect(fetched.organizations.map((o: { name: string }) => o.name)).toEqual(["Civic Coop"]);
      expect(fetched.expertise.map((e: { name: string }) => e.name)).toEqual(["Backend development"]);

      // The organization side sees the same many-to-many link.
      const organization = (await admin.get(`/api/admin/organizations/${coop.id}`)).body;
      expect(organization.people).toEqual([{ id: person.id, name: "Grace Example" }]);
    });

    it("replaces relationship sets via PATCH, and leaves them alone when omitted", async () => {
      const { web, backend } = await taxonomy();
      const a = await createOrganization({ name: "A" });
      const b = await createOrganization({ name: "B" });
      const person = await createPerson({ name: "P", organizationIds: [a.id], expertiseIds: [web.id] });

      let updated = (await admin.patch(`/api/admin/people/${person.id}`, { organizationIds: [b.id] }).expect(200)).body;
      expect(updated.organizations.map((o: { name: string }) => o.name)).toEqual(["B"]);
      expect(updated.expertise.map((e: { name: string }) => e.name)).toEqual(["Web development"]);

      updated = (await admin.patch(`/api/admin/people/${person.id}`, { expertiseIds: [backend.id, web.id] }).expect(200)).body;
      expect(updated.expertise).toHaveLength(2);
      updated = (await admin.patch(`/api/admin/people/${person.id}`, { organizationIds: [] }).expect(200)).body;
      expect(updated.organizations).toEqual([]);
    });

    it("refuses unknown ids with a 400/404, never a partial write", async () => {
      const person = await createPerson({ name: "P" });
      const missing = "00000000-0000-4000-8000-000000000000";
      const res = await admin.patch(`/api/admin/people/${person.id}`, { name: "Changed", organizationIds: [missing] }).expect(400);
      expect(res.body.error.details.issues[0].path).toBe("organizationIds");
      expect((await admin.get(`/api/admin/people/${person.id}`)).body.name).toBe("P");
      await admin.put(`/api/admin/people/${person.id}/organizations/${missing}`).expect(404);
      await admin.put(`/api/admin/people/${missing}/expertise/${missing}`).expect(404);
      await admin.post("/api/admin/people", { name: "Q", expertiseIds: [missing, missing] }).expect(400);
    });

    it("assigns expertise to organizations", async () => {
      const { web, backend } = await taxonomy();
      const organization = await createOrganization({ name: "Studio", website: "https://studio.example", expertiseIds: [web.id] });
      await admin.put(`/api/admin/organizations/${organization.id}/expertise/${backend.id}`).expect(204);
      await admin.delete(`/api/admin/organizations/${organization.id}/expertise/${web.id}`).expect(204);
      const fetched = (await admin.get(`/api/admin/organizations/${organization.id}`).expect(200)).body;
      expect(fetched.expertise.map((e: { name: string }) => e.name)).toEqual(["Backend development"]);
      expect(fetched.website).toBe("https://studio.example");
    });
  });

  describe("list contract", () => {
    beforeEach(async () => {
      const { web, backend } = await taxonomy();
      const lab = await createOrganization({ name: "Example Lab" });
      await createPerson({ name: "Alice Sample", stateKey: "sourced", sourceKey: "candide", personalNote: "First contact" });
      await createPerson({ name: "Bob Sample", stateKey: "contacted", sourceKey: "ai", organizationIds: [lab.id], expertiseIds: [web.id] });
      await createPerson({ name: "Carol Sample", stateKey: "collaborating", sourceKey: "candide", expertiseIds: [backend.id], doNotContact: true });
      await createPerson({ name: "Dan 50%_off", email: "dan@example.org" });
    });

    const names = (res: request.Response) => res.body.items.map((p: { name: string }) => p.name);

    it("paginates with a stable total", async () => {
      const first = await admin.get("/api/admin/people?pageSize=3&sort=name:asc").expect(200);
      expect(first.body).toMatchObject({ page: 1, pageSize: 3, total: 4 });
      expect(names(first)).toEqual(["Alice Sample", "Bob Sample", "Carol Sample"]);
      const second = await admin.get("/api/admin/people?pageSize=3&page=2&sort=name:asc").expect(200);
      expect(names(second)).toEqual(["Dan 50%_off"]);
      await admin.get("/api/admin/people?pageSize=101").expect(400);
    });

    it("searches names, notes, contacts, organizations and expertise case-insensitively", async () => {
      expect(names(await admin.get("/api/admin/people?search=CAROL"))).toEqual(["Carol Sample"]);
      expect(names(await admin.get("/api/admin/people?search=first%20contact"))).toEqual(["Alice Sample"]);
      expect(names(await admin.get("/api/admin/people?search=example%20lab"))).toEqual(["Bob Sample"]);
      expect(names(await admin.get("/api/admin/people?search=backend"))).toEqual(["Carol Sample"]);
      expect(names(await admin.get("/api/admin/people?search=dan%40example"))).toEqual(["Dan 50%_off"]);
      // LIKE wildcards are literal.
      expect(names(await admin.get("/api/admin/people?search=50%25_"))).toEqual(["Dan 50%_off"]);
      expect((await admin.get("/api/admin/people?search=%25")).body.total).toBe(1);
    });

    it("filters by state (any of), source, relations and flags", async () => {
      const q = (query: string) => admin.get(`/api/admin/people?sort=name:asc&${query}`).expect(200);
      expect(names(await q("filter=state:is:sourced&filter=state:is:contacted"))).toEqual(["Alice Sample", "Bob Sample"]);
      expect(names(await q("filter=state:is_empty"))).toEqual(["Dan 50%_off"]);
      expect(names(await q("filter=source:is:candide&filter=name:contains:car"))).toEqual(["Carol Sample"]);
      expect(names(await q("filter=state:is_not:sourced"))).toEqual(["Bob Sample", "Carol Sample", "Dan 50%_off"]);
      expect(names(await q("filter=organization:is_not_empty"))).toEqual(["Bob Sample"]);
      expect(names(await q("filter=expertise:is_empty"))).toEqual(["Alice Sample", "Dan 50%_off"]);
      expect(names(await q("filter=do_not_contact:is:true"))).toEqual(["Carol Sample"]);
      expect(names(await q("filter=personal_note:is_not_empty"))).toEqual(["Alice Sample"]);
      await admin.get("/api/admin/people?filter=password:is:x").expect(400);
    });

    it("sorts by vocabulary order (not alphabetically), nulls last, multi-key", async () => {
      expect(names(await admin.get("/api/admin/people?sort=state:asc"))).toEqual([
        "Alice Sample",
        "Bob Sample",
        "Carol Sample",
        "Dan 50%_off",
      ]);
      expect(names(await admin.get("/api/admin/people?sort=state:desc"))).toEqual([
        "Carol Sample",
        "Bob Sample",
        "Alice Sample",
        "Dan 50%_off",
      ]);
      expect(names(await admin.get("/api/admin/people?sort=source:asc&sort=name:desc"))).toEqual([
        "Carol Sample",
        "Alice Sample",
        "Bob Sample",
        "Dan 50%_off",
      ]);
      // Default: newest first.
      expect(names(await admin.get("/api/admin/people"))[0]).toBe("Dan 50%_off");
    });

    it("lists organizations with search, filters and sort", async () => {
      await createOrganization({ name: "Zeta Network" });
      const res = await admin.get("/api/admin/organizations?sort=people:desc").expect(200);
      expect(res.body.items[0].name).toBe("Example Lab");
      expect(res.body.items[0].people).toHaveLength(1);
      const filtered = await admin.get("/api/admin/organizations?filter=person:is_empty").expect(200);
      expect(filtered.body.items.map((o: { name: string }) => o.name)).toEqual(["Zeta Network"]);
    });
  });

  describe("expertise taxonomy", () => {
    it("returns the hierarchy with usage counts", async () => {
      const { web } = await taxonomy();
      await createPerson({ name: "P", expertiseIds: [web.id] });
      const tree = (await admin.get("/api/admin/expertise/tree").expect(200)).body;
      expect(tree.domains).toHaveLength(1);
      expect(tree.domains[0].fields[0].items).toEqual([
        { id: expect.any(String), name: "Backend development", peopleCount: 0, organizationCount: 0 },
        { id: web.id, name: "Web development", peopleCount: 1, organizationCount: 0 },
      ]);
    });

    it("enforces unique sibling names case-insensitively, but allows them under different parents", async () => {
      const { domain, field } = await taxonomy();
      const res = await admin.post("/api/admin/expertise/items", { name: "WEB DEVELOPMENT", fieldId: field.id }).expect(409);
      expect(res.body.error.details.constraint).toBe("expertise_items_field_name_unique");
      const other = (await admin.post("/api/admin/expertise/fields", { name: "Design", domainId: domain.id }).expect(201)).body;
      await admin.post("/api/admin/expertise/items", { name: "Web development", fieldId: other.id }).expect(201);
      await admin.post("/api/admin/expertise/domains", { name: "technology" }).expect(409);
    });

    it("renames, and deletes only what nothing depends on", async () => {
      const { domain, field, web, backend } = await taxonomy();
      await createPerson({ name: "P", expertiseIds: [web.id] });
      await admin.patch(`/api/admin/expertise/items/${backend.id}`, { name: "Server development" }).expect(200);

      await admin.delete(`/api/admin/expertise/items/${web.id}`).expect(409);
      await admin.delete(`/api/admin/expertise/fields/${field.id}`).expect(409);
      await admin.delete(`/api/admin/expertise/domains/${domain.id}`).expect(409);
      await admin.delete(`/api/admin/expertise/items/${backend.id}`).expect(204);
      await admin.delete(`/api/admin/expertise/items/${backend.id}`).expect(404);
      await admin.post("/api/admin/expertise/fields", { name: "X", domainId: "00000000-0000-4000-8000-000000000000" }).expect(404);
    });
  });

  describe("database constraints (independent of the API's own checks)", () => {
    it("rejects orphan links, blank names and malformed emails", async () => {
      const missing = "00000000-0000-4000-8000-000000000000";
      await expect(t.db.insert(peopleOrganizations).values({ personId: missing, organizationId: missing })).rejects.toThrow();
      await expect(t.db.insert(people).values({ name: "  " })).rejects.toThrow();
      await expect(t.db.insert(people).values({ name: "X", email: "nope" })).rejects.toThrow();
      await expect(t.db.insert(people).values({ name: "X", stateKey: "unknown" })).rejects.toThrow();
    });

    it("cascades links when a person or organization is deleted, but never deletes in-use expertise", async () => {
      const { web } = await taxonomy();
      const organization = await createOrganization({ name: "O", expertiseIds: [web.id] });
      const person = await createPerson({ name: "P", organizationIds: [organization.id], expertiseIds: [web.id] });
      await expect(t.db.delete(expertiseItems).where(sql`${expertiseItems.id} = ${web.id}`)).rejects.toThrow();

      await t.db.delete(people).where(sql`${people.id} = ${person.id}`);
      expect(await t.db.$count(peopleOrganizations)).toBe(0);
      expect(await t.db.$count(peopleExpertise)).toBe(0);
      await t.db.delete(organizations).where(sql`${organizations.id} = ${organization.id}`);
      expect(await t.db.$count(organizationExpertise)).toBe(0);
    });

    it("renaming a vocabulary key cascades to people (lookup tables, not enums)", async () => {
      const person = await createPerson({ name: "P", stateKey: "sourced" });
      await t.db.execute(sql`insert into person_states (key, label, sort_order) values ('prospect', 'Prospect', 5)`);
      await t.db.execute(sql`update person_states set key = 'identified' where key = 'sourced'`);
      const fetched = (await admin.get(`/api/admin/people/${person.id}`)).body;
      expect(fetched.state).toEqual({ key: "identified", label: "Sourced" });
      // Restore the shared vocabulary for the other tests.
      await t.db.execute(sql`update person_states set key = 'sourced' where key = 'identified'`);
      await t.db.execute(sql`delete from person_states where key = 'prospect'`);
    });
  });
});
