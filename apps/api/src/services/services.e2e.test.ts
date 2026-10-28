import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminUsers } from "../auth/auth.schema.js";
import { signedInAdmin, signedInAs, type SignedInAdmin } from "../testing/admin-session.js";
import { createTestApp, type TestApp } from "../testing/test-app.js";

/**
 * Services and permissions (access grants), admin-desktop.pdf p16–p17:
 * records with their history, the Figma views, and — on the person, the
 * admin account and the service — "granted / changed / revoked access".
 */
describe("services and access grants", () => {
  let t: TestApp;
  let owner: SignedInAdmin;
  beforeAll(async () => {
    t = await createTestApp({ TRUST_PROXY_HOPS: "1" });
    owner = await signedInAdmin(t);
  });
  afterAll(async () => {
    await t.close();
  });

  type Item = { action: string; changes: { field: string; before: unknown; after: unknown }[]; meta: Record<string, unknown> };
  const feed = async (type: string, id: string) => (await owner.get(`/api/admin/history/${type}/${id}`).expect(200)).body.items as Item[];

  it("offers the Figma vocabularies (seeded, no demo rows) and starts empty", async () => {
    const options = (await owner.get("/api/admin/services/options").expect(200)).body;
    expect(options.statuses.map((status: { label: string }) => status.label)).toEqual(["Active", "Needs confirmation", "Planned", "Retired"]);
    expect(options.hostingModels.map((model: { label: string }) => model.label)).toEqual(["External service", "Internal application", "Self-hosted"]);
    expect(options.levels.map((level: { key: string }) => level.key)).toEqual(["owner", "rootadmin", "superadmin", "admin", "write", "read"]);
    expect(options.accessStatuses.map((status: { label: string }) => status.label)).toEqual(["Planned", "Invited", "Active", "Needs confirmation", "Revoked", "Expired"]);
    expect((await owner.get("/api/admin/services").expect(200)).body.total).toBe(0);
    expect((await owner.get("/api/admin/access-grants").expect(200)).body.total).toBe(0);
  });

  it("creates, edits, archives and restores a service, each in its history; validates the URL", async () => {
    const [account] = await t.db.select().from(adminUsers).where(eq(adminUsers.email, "owner@example.org"));
    const service = (await owner.post("/api/admin/services", { name: "GitHub", statusKey: "active", categoryKey: "source_code", hostingModelKey: "external_service", url: "github.com/Global-experiment", responsibleAdminId: account!.id }).expect(201)).body;
    expect(service).toMatchObject({ name: "GitHub", status: { label: "Active" }, category: { label: "Source code" }, responsible: { id: account!.id }, serviceNumber: expect.any(Number) });
    await owner.post("/api/admin/services", { name: "Bad", url: "not a link" }).expect(400);
    await owner.patch(`/api/admin/services/${service.id}`, { statusKey: "needs_confirmation" }).expect(200);
    await owner.post(`/api/admin/services/${service.id}/archive`).expect(200);
    expect((await owner.get("/api/admin/services").expect(200)).body.total).toBe(0);
    expect((await owner.get("/api/admin/services?filter=archived:is:true").expect(200)).body.total).toBe(1);
    await owner.post(`/api/admin/services/${service.id}/restore`).expect(200);
    expect((await feed("service", service.id)).map((item) => item.action)).toEqual(["restored", "archived", "updated", "created"]);
  });

  it("grants access: the grant, its person, its account and its service all record it; changes and revocation too", async () => {
    const person = (await owner.post("/api/admin/people", { name: "Stanley Qiang" }).expect(201)).body;
    const [account] = await t.db.select().from(adminUsers).where(eq(adminUsers.email, "owner@example.org"));
    const service = (await owner.get("/api/admin/services?search=GitHub").expect(200)).body.items[0];

    const grant = (await owner.post("/api/admin/access-grants", { personId: person.id, adminUserId: account!.id, serviceId: service.id, levelKey: "read", statusKey: "needs_confirmation", resourceScope: "Global-experiment organization" }).expect(201)).body;
    expect(grant).toMatchObject({ title: "GitHub / read", person: { name: "Stanley Qiang" }, service: { name: "GitHub" }, level: { key: "read" } });
    for (const [type, id] of [["person", person.id], ["admin_user", account!.id], ["service", service.id]] as const) {
      const [event] = await feed(type, id);
      expect(event, type).toMatchObject({ action: "access_granted", changes: [{ field: "permissions", before: [], after: [{ label: "GitHub · read" }] }] });
    }
    // The person and the service show the grant.
    expect((await owner.get(`/api/admin/people/${person.id}`).expect(200)).body.permissions).toEqual([{ id: grant.id, service: "GitHub", level: "read", status: { key: "needs_confirmation", label: "Needs confirmation" } }]);
    expect((await owner.get(`/api/admin/services/${service.id}`).expect(200)).body.permissions).toHaveLength(1);

    // A new level is a change (prototype: "GitHub · Read → GitHub · Write").
    await owner.patch(`/api/admin/access-grants/${grant.id}`, { levelKey: "write", statusKey: "active" }).expect(200);
    expect((await feed("person", person.id))[0]).toMatchObject({ action: "access_changed", changes: [{ before: [{ label: "GitHub · read" }], after: [{ label: "GitHub · write" }] }], meta: { note: "Status: Needs confirmation → Active." } });
    // Revoked: "Grant status changed to Revoked."
    await owner.patch(`/api/admin/access-grants/${grant.id}`, { statusKey: "revoked", revokedOn: "2026-10-28" }).expect(200);
    expect((await feed("service", service.id))[0]).toMatchObject({ action: "access_revoked", changes: [{ before: [{ label: "GitHub · write" }], after: [] }], meta: { note: "Grant status changed to Revoked." } });
    // The grant's own history: created, then one event per change.
    expect((await feed("access_grant", grant.id)).map((item) => item.action)).toEqual(["updated", "updated", "created"]);
  });

  it("moves a grant to another person: revoked on the old one, granted on the new one", async () => {
    const grant = (await owner.get("/api/admin/access-grants").expect(200)).body.items[0];
    const other = (await owner.post("/api/admin/people", { name: "Candide" }).expect(201)).body;
    await owner.patch(`/api/admin/access-grants/${grant.id}`, { personId: other.id, statusKey: "active", revokedOn: null }).expect(200);
    expect((await feed("person", grant.person.id))[0]).toMatchObject({ action: "access_revoked" });
    expect((await feed("person", other.id))[0]).toMatchObject({ action: "access_granted" });
  });

  it("lists the views of Figma p16–p17: Active services, Access review; Active permissions, Review queue", async () => {
    const service = (await owner.post("/api/admin/services", { name: "Notion", statusKey: "active" }).expect(201)).body;
    const person = (await owner.post("/api/admin/people", { name: "Reviewer" }).expect(201)).body;
    await owner.post("/api/admin/access-grants", { personId: person.id, serviceId: service.id, levelKey: "admin", statusKey: "needs_confirmation" }).expect(201);
    const names = async (path: string) => ((await owner.get(path).expect(200)).body.items as { name?: string; title?: string }[]).map((item) => item.name ?? item.title);
    // GitHub was set to "Needs confirmation" above.
    expect(await names("/api/admin/services?filter=status:is:active")).toEqual(["Notion"]);
    expect(await names("/api/admin/services?filter=review:is:true")).toEqual(expect.arrayContaining(["Notion"]));
    expect(await names("/api/admin/access-grants?filter=review:is:true")).toEqual(["Notion / admin"]);
    expect(await names("/api/admin/access-grants?filter=status:is:active")).toEqual(["GitHub / write"]);
  });

  it("deletes only with the typed name or #number; refuses a service or a person that grants still name", async () => {
    const service = (await owner.get("/api/admin/services?search=Notion").expect(200)).body.items[0];
    await owner.delete(`/api/admin/services/${service.id}`).send({ confirm: "Notion" }).expect(409);
    const grant = (await owner.get("/api/admin/access-grants?filter=review:is:true").expect(200)).body.items[0];
    await owner.delete(`/api/admin/people/${grant.person.id}`).send({ confirm: grant.person.name }).expect(409);
    await owner.delete(`/api/admin/access-grants/${grant.id}`).send({ confirm: "#0" }).expect(400);
    await owner.delete(`/api/admin/access-grants/${grant.id}`).send({ confirm: `#${grant.grantNumber}` }).expect(204);
    expect((await feed("person", grant.person.id))[0]).toMatchObject({ action: "access_revoked", meta: { note: "Permission deleted." } });
    await owner.delete(`/api/admin/services/${service.id}`).send({ confirm: "Notion" }).expect(204);
  });

  it("follows the roles: Operation admin manages grants, Treasury admin only reads, Moderator neither", async () => {
    const service = (await owner.get("/api/admin/services?search=GitHub").expect(200)).body.items[0];
    const operations = await signedInAs(t, "operations");
    await operations.post("/api/admin/access-grants", { serviceId: service.id, levelKey: "read" }).expect(201);
    await operations.delete(`/api/admin/services/${service.id}`).send({ confirm: "GitHub" }).expect(403);
    const treasury = await signedInAs(t, "treasury");
    await treasury.get("/api/admin/access-grants").expect(200);
    await treasury.post("/api/admin/access-grants", { serviceId: service.id }).expect(403);
    const moderator = await signedInAs(t, "moderation");
    await moderator.get("/api/admin/services").expect(403);
  });

  it("shows a person's access only to roles that can read Permissions", async () => {
    const service = (await owner.get("/api/admin/services?search=GitHub").expect(200)).body.items[0];
    const person = (await owner.post("/api/admin/people", { name: "Access holder" }).expect(201)).body;
    await owner.post("/api/admin/access-grants", { personId: person.id, serviceId: service.id, levelKey: "read" }).expect(201);
    expect((await owner.get(`/api/admin/people/${person.id}`).expect(200)).body.permissions).toHaveLength(1);
    // A Moderator reads people (directory.read) but not Permissions (access.read).
    const moderator = await signedInAs(t, "moderation");
    expect((await moderator.get(`/api/admin/people/${person.id}`).expect(200)).body.permissions).toEqual([]);
    const page = (await moderator.get("/api/admin/people?search=Access%20holder").expect(200)).body;
    expect(page.items.map((item: { permissions: unknown[] }) => item.permissions)).toEqual([[]]);
  });
});
