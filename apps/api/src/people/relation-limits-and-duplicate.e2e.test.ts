import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { LIMIT_MESSAGES } from "../common/relation-limits.js";
import { expertiseDomains, expertiseFields, expertiseItems, expertiseTeams } from "../expertise/expertise.schema.js";
import { organizationExpertise, organizations } from "../organizations/organizations.schema.js";
import { signedInAdmin, type SignedInAdmin } from "../testing/admin-session.js";
import { createTestApp, type TestApp } from "../testing/test-app.js";
import { people, peopleExpertise, peopleOrganizations } from "./people.schema.js";

/**
 * The relationship caps (10 expertise per person/organization, 5
 * organizations per person) on every write path, and Duplicate.
 */
describe("relationship limits and duplicate", () => {
  let t: TestApp;
  let admin: SignedInAdmin;

  beforeAll(async () => {
    t = await createTestApp({ TRUST_PROXY_HOPS: "1" });
    admin = await signedInAdmin(t);
  });
  afterAll(async () => {
    await t.close();
  });
  beforeEach(async () => {
    await t.db.delete(expertiseTeams);
    await t.db.delete(peopleExpertise);
    await t.db.delete(peopleOrganizations);
    await t.db.delete(organizationExpertise);
    await t.db.delete(people);
    await t.db.delete(organizations);
    await t.db.delete(expertiseItems);
    await t.db.delete(expertiseFields);
    await t.db.delete(expertiseDomains);
  });

  async function expertise(count: number): Promise<string[]> {
    const domain = (await admin.post("/api/admin/expertise/domains", { name: "Technology" }).expect(201)).body;
    const field = (await admin.post("/api/admin/expertise/fields", { name: "Software", domainId: domain.id }).expect(201)).body;
    const ids: string[] = [];
    for (let index = 1; index <= count; index++) {
      ids.push((await admin.post("/api/admin/expertise/items", { name: `Skill ${index}`, fieldId: field.id }).expect(201)).body.id);
    }
    return ids;
  }
  async function organizationIds(count: number): Promise<string[]> {
    const ids: string[] = [];
    for (let index = 1; index <= count; index++) ids.push((await admin.post("/api/admin/organizations", { name: `Org ${index}` }).expect(201)).body.id);
    return ids;
  }
  const createPerson = async (body: object) => (await admin.post("/api/admin/people", body).expect(201)).body;
  const issuesOf = (res: { body: { error: { details: { issues: { path: string; message: string }[] } } } }) => res.body.error.details.issues;

  describe("a person's 10 expertise", () => {
    it("accepts 10 and refuses 11 on create and on PATCH, naming the field", async () => {
      const ids = await expertise(11);
      const person = await createPerson({ name: "Ten Skills", expertiseIds: ids.slice(0, 10) });
      expect(person.expertise).toHaveLength(10);

      let res = await admin.post("/api/admin/people", { name: "Eleven", expertiseIds: ids }).expect(400);
      expect(issuesOf(res)).toEqual([{ path: "expertiseIds", message: LIMIT_MESSAGES.personExpertise }]);
      res = await admin.patch(`/api/admin/people/${person.id}`, { expertiseIds: ids }).expect(400);
      expect(issuesOf(res)).toEqual([{ path: "expertiseIds", message: LIMIT_MESSAGES.personExpertise }]);
      expect(await t.db.$count(peopleExpertise)).toBe(10);
    });

    it("refuses an 11th link through PUT, but re-linking an existing one stays a no-op", async () => {
      const ids = await expertise(11);
      const person = await createPerson({ name: "Ten Skills", expertiseIds: ids.slice(0, 10) });
      await admin.put(`/api/admin/people/${person.id}/expertise/${ids[0]}`).expect(204);
      const res = await admin.put(`/api/admin/people/${person.id}/expertise/${ids[10]}`).expect(400);
      expect(issuesOf(res)[0]!.message).toBe(LIMIT_MESSAGES.personExpertise);
      expect(await t.db.$count(peopleExpertise)).toBe(10);
    });
  });

  describe("a person's 5 organizations", () => {
    it("accepts 5 and refuses 6 on create, PATCH and PUT", async () => {
      const ids = await organizationIds(6);
      const person = await createPerson({ name: "Five Orgs", organizationIds: ids.slice(0, 5) });
      expect(person.organizations).toHaveLength(5);

      let res = await admin.post("/api/admin/people", { name: "Six", organizationIds: ids }).expect(400);
      expect(issuesOf(res)).toEqual([{ path: "organizationIds", message: LIMIT_MESSAGES.personOrganizations }]);
      res = await admin.patch(`/api/admin/people/${person.id}`, { organizationIds: ids }).expect(400);
      expect(issuesOf(res)[0]!.path).toBe("organizationIds");
      res = await admin.put(`/api/admin/people/${person.id}/organizations/${ids[5]}`).expect(400);
      expect(issuesOf(res)[0]!.message).toBe(LIMIT_MESSAGES.personOrganizations);
    });

    it("is checked when linking from the organization's side too (the person's limit)", async () => {
      const ids = await organizationIds(6);
      const full = await createPerson({ name: "Five Orgs", organizationIds: ids.slice(0, 5) });
      const other = await createPerson({ name: "Free" });

      const res = await admin.put(`/api/admin/organizations/${ids[5]}/people/${full.id}`).expect(400);
      expect(issuesOf(res)).toEqual([{ path: "personIds", message: "This person already has 5 organizations (the maximum)." }]);
      await admin.put(`/api/admin/organizations/${ids[0]}/people/${full.id}`).expect(204); // already linked: no-op
      await admin.put(`/api/admin/organizations/${ids[5]}/people/${other.id}`).expect(204);
      expect(await t.db.$count(peopleOrganizations)).toBe(6);
    });
  });

  describe("an organization's 10 expertise", () => {
    it("accepts 10 and refuses 11 on create, PATCH and PUT", async () => {
      const ids = await expertise(11);
      const organization = (await admin.post("/api/admin/organizations", { name: "Lab", expertiseIds: ids.slice(0, 10) }).expect(201)).body;
      expect(organization.expertise).toHaveLength(10);

      let res = await admin.post("/api/admin/organizations", { name: "Too many", expertiseIds: ids }).expect(400);
      expect(issuesOf(res)).toEqual([{ path: "expertiseIds", message: LIMIT_MESSAGES.organizationExpertise }]);
      res = await admin.patch(`/api/admin/organizations/${organization.id}`, { expertiseIds: ids }).expect(400);
      expect(issuesOf(res)[0]!.message).toBe(LIMIT_MESSAGES.organizationExpertise);
      res = await admin.put(`/api/admin/organizations/${organization.id}/expertise/${ids[10]}`).expect(400);
      expect(issuesOf(res)[0]!.message).toBe(LIMIT_MESSAGES.organizationExpertise);
      expect(await t.db.$count(organizationExpertise)).toBe(10);
    });
  });

  describe("duplicate", () => {
    it("copies a person's values and links, without the Notion page id or the Person ID", async () => {
      const [skill] = await expertise(1);
      const [org] = await organizationIds(1);
      const original = await createPerson({
        name: "Ada Example",
        stateKey: "contacted",
        sourceKey: "candide",
        personalNote: "Met at the summit",
        doNotContact: true,
        email: "ada@example.org",
        nextFollowupAt: "2026-11-02T08:00:00Z",
        relevanceScore: 6,
        contactChannelKeys: ["whatsapp"],
        organizationIds: [org],
        expertiseIds: [skill],
      });
      const notionPage = "11111111-2222-4333-8444-555555555555";
      await t.db.update(people).set({ notionPageId: notionPage });

      const copy = (await admin.post(`/api/admin/people/${original.id}/duplicate`).expect(201)).body;
      expect(copy.id).not.toBe(original.id);
      expect(copy.personNumber).not.toBe(original.personNumber);
      expect(copy.notionPageId).toBeNull();
      expect(copy).toMatchObject({
        name: "Ada Example",
        state: { key: "contacted" },
        source: { key: "candide" },
        personalNote: "Met at the summit",
        doNotContact: true,
        email: "ada@example.org",
        nextFollowupAt: "2026-11-02T08:00:00.000Z",
        relevanceScore: 6,
        contactChannels: [{ key: "whatsapp", label: "WhatsApp" }],
        organizations: [{ id: org }],
      });
      expect(copy.expertise.map((item: { id: string }) => item.id)).toEqual([skill]);
      // The original is untouched.
      expect((await admin.get(`/api/admin/people/${original.id}`).expect(200)).body.notionPageId).toBe(notionPage);
    });

    it("copies an organization's values and expertise, not its people", async () => {
      const [skill] = await expertise(1);
      const organization = (await admin.post("/api/admin/organizations", { name: "Lab", website: "https://lab.example.org", expertiseIds: [skill] }).expect(201)).body;
      const person = await createPerson({ name: "Member", organizationIds: [organization.id] });

      const copy = (await admin.post(`/api/admin/organizations/${organization.id}/duplicate`).expect(201)).body;
      expect(copy.orgNumber).not.toBe(organization.orgNumber);
      expect(copy).toMatchObject({ name: "Lab", website: "https://lab.example.org", notionPageId: null, people: [] });
      expect(copy.expertise.map((item: { id: string }) => item.id)).toEqual([skill]);
      expect((await admin.get(`/api/admin/people/${person.id}`).expect(200)).body.organizations).toHaveLength(1);
    });

    it("returns 404 for an unknown record", async () => {
      const missing = "00000000-0000-4000-8000-000000000000";
      await admin.post(`/api/admin/people/${missing}/duplicate`).expect(404);
      await admin.post(`/api/admin/organizations/${missing}/duplicate`).expect(404);
    });
  });
});
