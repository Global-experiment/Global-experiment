import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { people, peopleOrganizations } from "../people/people.schema.js";
import { signedInAdmin, type SignedInAdmin } from "../testing/admin-session.js";
import { createTestApp, TEST_ORIGIN, type TestApp } from "../testing/test-app.js";
import { organizations } from "./organizations.schema.js";

const MISSING = "00000000-0000-4000-8000-000000000000";

/** PUT/DELETE /api/admin/organizations/:id/people/:personId through the full HTTP stack. */
describe("organization ↔ people links", () => {
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
    await t.db.delete(peopleOrganizations);
    await t.db.delete(people);
    await t.db.delete(organizations);
  });

  const createOrganization = async (name: string) => (await admin.post("/api/admin/organizations", { name }).expect(201)).body;
  const createPerson = async (name: string) => (await admin.post("/api/admin/people", { name }).expect(201)).body;

  it("links a person from the organization, visible on both records", async () => {
    const organization = await createOrganization("Example Lab");
    const person = await createPerson("Ada Example");

    await admin.put(`/api/admin/organizations/${organization.id}/people/${person.id}`).expect(204);

    const fromOrganization = (await admin.get(`/api/admin/organizations/${organization.id}`).expect(200)).body;
    expect(fromOrganization.people).toEqual([{ id: person.id, name: "Ada Example" }]);
    const fromPerson = (await admin.get(`/api/admin/people/${person.id}`).expect(200)).body;
    expect(fromPerson.organizations).toEqual([{ id: organization.id, name: "Example Lab" }]);

    // Both records are touched by a real change.
    expect(new Date(fromOrganization.updatedAt).getTime()).toBeGreaterThan(new Date(organization.updatedAt).getTime());
    expect(new Date(fromPerson.updatedAt).getTime()).toBeGreaterThan(new Date(person.updatedAt).getTime());
  });

  it("is idempotent and shares the row with the person-side endpoints", async () => {
    const organization = await createOrganization("Civic Coop");
    const person = await createPerson("Grace Example");

    await admin.put(`/api/admin/organizations/${organization.id}/people/${person.id}`).expect(204);
    await admin.put(`/api/admin/organizations/${organization.id}/people/${person.id}`).expect(204);
    await admin.put(`/api/admin/people/${person.id}/organizations/${organization.id}`).expect(204);
    expect(await t.db.$count(peopleOrganizations)).toBe(1);

    // Unlinking from the organization removes the person-side link too.
    await admin.delete(`/api/admin/organizations/${organization.id}/people/${person.id}`).expect(204);
    await admin.delete(`/api/admin/organizations/${organization.id}/people/${person.id}`).expect(204);
    expect((await admin.get(`/api/admin/people/${person.id}`)).body.organizations).toEqual([]);
    expect((await admin.get(`/api/admin/organizations/${organization.id}`)).body.people).toEqual([]);
  });

  it("returns 404 for an unknown organization or person and 400 for malformed ids", async () => {
    const organization = await createOrganization("Studio");
    const person = await createPerson("Linus Example");

    let res = await admin.put(`/api/admin/organizations/${MISSING}/people/${person.id}`).expect(404);
    expect(res.body.error.message).toBe("Organization not found.");
    res = await admin.put(`/api/admin/organizations/${organization.id}/people/${MISSING}`).expect(404);
    expect(res.body.error.message).toBe("Person not found.");
    await admin.delete(`/api/admin/organizations/${MISSING}/people/${person.id}`).expect(404);

    res = await admin.put(`/api/admin/organizations/not-a-uuid/people/${person.id}`).expect(400);
    expect(res.body.error.code).toBe("validation_failed");
    await admin.put(`/api/admin/organizations/${organization.id}/people/nope`).expect(400);
    expect(await t.db.$count(peopleOrganizations)).toBe(0);
  });

  it("is protected like every admin endpoint: session required, cross-site writes refused", async () => {
    const organization = await createOrganization("Guarded Org");
    const person = await createPerson("Guarded Person");
    const path = `/api/admin/organizations/${organization.id}/people/${person.id}`;

    const unauthenticated = await anonymous().put(path).set("origin", TEST_ORIGIN).expect(401);
    expect(unauthenticated.body.error.code).toBe("unauthenticated");
    await anonymous().delete(path).set("origin", TEST_ORIGIN).expect(401);

    await admin.put(path).set("origin", "https://evil.example").expect(403);
    await admin.delete(path).set("origin", "https://evil.example").expect(403);
    expect(await t.db.$count(peopleOrganizations)).toBe(0);
  });
});
