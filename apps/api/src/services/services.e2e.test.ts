import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditEvents } from "../audit/audit.schema.js";
import { adminUsers } from "../auth/auth.schema.js";
import { signedInAdmin, signedInAs, type SignedInAdmin } from "../testing/admin-session.js";
import { createTestApp, type TestApp } from "../testing/test-app.js";

/**
 * Services and permissions (access grants), admin-desktop.pdf p16–p17, after
 * Candide's first feedback (2026-11-03): category tags (OPS-149), no
 * responsible account (OPS-130), names made from service, account and level
 * (OPS-138), the detail order and labels (OPS-148), ONE history event per
 * grant write, shown on its account, service and person (OPS-151), and no
 * permanent delete (OPS-147). Fixtures in this file only.
 */
describe("services and access grants", () => {
  let t: TestApp;
  let owner: SignedInAdmin;
  let ownerId: string;
  beforeAll(async () => {
    t = await createTestApp({ TRUST_PROXY_HOPS: "1" });
    owner = await signedInAdmin(t);
    ownerId = (await t.db.select().from(adminUsers).where(eq(adminUsers.email, "owner@example.org")))[0]!.id;
  });
  afterAll(async () => {
    await t.close();
  });

  type Item = { action: string; changes: { field: string; label: string; before: unknown; after: unknown }[]; meta: Record<string, unknown> };
  const feed = async (type: string, id: string) => (await owner.get(`/api/admin/history/${type}/${id}`).expect(200)).body.items as Item[];

  it("offers the Figma vocabularies (seeded, no demo rows) and starts empty", async () => {
    const options = (await owner.get("/api/admin/services/options").expect(200)).body;
    expect(options.statuses.map((status: { label: string }) => status.label)).toEqual(["Active", "Needs confirmation", "Planned", "Retired"]);
    expect(options.hostingModels.map((model: { label: string }) => model.label)).toEqual(["External service", "Internal application", "Self-hosted"]);
    expect(options.levels.map((level: { key: string }) => level.key)).toEqual(["owner", "rootadmin", "superadmin", "admin", "write", "read"]);
    expect(options.accessStatuses.map((status: { label: string }) => status.label)).toEqual([
      "Planned",
      "Invited",
      "Active",
      "Needs confirmation",
      "Revoked",
      "Expired",
    ]);
    expect((await owner.get("/api/admin/services").expect(200)).body.total).toBe(0);
    expect((await owner.get("/api/admin/access-grants").expect(200)).body.total).toBe(0);
  });

  it("creates, edits, archives and restores a service, each in its history; several categories as tags; validates the URL", async () => {
    const service = (
      await owner
        .post("/api/admin/services", {
          name: "GitHub",
          statusKey: "active",
          categoryKeys: ["source_code", "hosting"],
          hostingModelKey: "external_service",
          url: "github.com/Global-experiment",
        })
        .expect(201)
    ).body;
    expect(service).toMatchObject({
      name: "GitHub",
      status: { label: "Active" },
      categories: [
        { key: "source_code", label: "Source code" },
        { key: "hosting", label: "Hosting" },
      ],
      serviceNumber: expect.any(Number),
    });
    expect(service).not.toHaveProperty("responsible");
    // OPS-130: no responsible account any more.
    await owner.post("/api/admin/services", { name: "Bad", responsibleAdminId: ownerId }).expect(400);
    await owner.post("/api/admin/services", { name: "Bad", url: "not a link" }).expect(400);
    await owner.post("/api/admin/services", { name: "Bad", categoryKeys: ["nope"] }).expect(400);
    await owner.post("/api/admin/services", { name: "Bad", categoryKeys: ["ai", "ai"] }).expect(400);
    await owner.patch(`/api/admin/services/${service.id}`, { statusKey: "needs_confirmation", categoryKeys: ["source_code"] }).expect(200);
    expect((await feed("service", service.id))[0]).toMatchObject({
      action: "updated",
      changes: expect.arrayContaining([
        expect.objectContaining({ field: "categories", label: "Category", after: [{ id: "source_code", label: "Source code" }] }),
      ]),
    });
    // Filters: "is" = has the tag, "is empty" = no tag.
    expect((await owner.get("/api/admin/services?filter=category:is:source_code").expect(200)).body.total).toBe(1);
    expect((await owner.get("/api/admin/services?filter=category:is:hosting").expect(200)).body.total).toBe(0);
    expect((await owner.get("/api/admin/services?filter=category:is_empty").expect(200)).body.total).toBe(0);
    await owner.post(`/api/admin/services/${service.id}/archive`).expect(200);
    expect((await owner.get("/api/admin/services").expect(200)).body.total).toBe(0);
    expect((await owner.get("/api/admin/services?filter=archived:is:true").expect(200)).body.total).toBe(1);
    await owner.post(`/api/admin/services/${service.id}/restore`).expect(200);
    expect((await feed("service", service.id)).map((item) => item.action)).toEqual(["restored", "archived", "updated", "created"]);
  });

  it("names a permission Service / Account / Permission level, and keeps the name up to date (OPS-138)", async () => {
    const service = (await owner.get("/api/admin/services?search=GitHub").expect(200)).body.items[0];
    const grant = (
      await owner
        .post("/api/admin/access-grants", { adminUserId: ownerId, serviceId: service.id, levelKey: "read", statusKey: "needs_confirmation" })
        .expect(201)
    ).body;
    expect(grant.title).toBe("GitHub / owner / Read");
    // No name of one's own any more.
    await owner.post("/api/admin/access-grants", { name: "Mine", serviceId: service.id }).expect(400);
    await owner.patch(`/api/admin/access-grants/${grant.id}`, { levelKey: "superadmin" }).expect(200);
    expect((await owner.get(`/api/admin/access-grants/${grant.id}`).expect(200)).body.title).toBe("GitHub / owner / Superadmin");
    await owner.patch(`/api/admin/services/${service.id}`, { name: "GitHub org" }).expect(200);
    await owner.patch("/api/admin/profile", { displayName: "Candide" }).expect(200);
    expect((await owner.get(`/api/admin/access-grants/${grant.id}`).expect(200)).body.title).toBe("GitHub org / Candide / Superadmin");
    // Renaming the service or the account isn't a change of the permission.
    expect((await feed("access_grant", grant.id)).map((item) => item.action)).toEqual(["updated", "access_granted"]);
    await owner.patch(`/api/admin/services/${service.id}`, { name: "GitHub" }).expect(200);
    await owner.patch("/api/admin/profile", { displayName: null }).expect(200);
    await owner.post(`/api/admin/access-grants/${grant.id}/archive`).expect(200);
  });

  it('granting access is ONE event, "granted <account> <level> on <service>", shown on the account, the service and the person (OPS-151)', async () => {
    const person = (await owner.post("/api/admin/people", { name: "Stanley Qiang" }).expect(201)).body;
    const service = (await owner.get("/api/admin/services?search=GitHub").expect(200)).body.items[0];
    const before = (await t.db.select().from(auditEvents)).length;
    const grant = (
      await owner
        .post("/api/admin/access-grants", { personId: person.id, adminUserId: ownerId, serviceId: service.id, levelKey: "owner", statusKey: "active" })
        .expect(201)
    ).body;
    // In the order they were written (the id), so the slice is exactly the new ones.
    const written = (await t.db.select().from(auditEvents).orderBy(asc(auditEvents.id))).slice(before);
    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({
      entityType: "access_grant",
      entityId: grant.id,
      action: "access_granted",
      meta: { account: "owner", level: "Owner", service: "GitHub" },
    });
    for (const [type, id] of [
      ["person", person.id],
      ["admin_user", ownerId],
      ["service", service.id],
      ["access_grant", grant.id],
    ] as const) {
      const [event] = await feed(type, id);
      expect(event, type).toMatchObject({ action: "access_granted", meta: { account: "owner", level: "Owner", service: "GitHub" } });
    }
    // A change is one event too, on the grant, shown on the others.
    const changedBefore = (await t.db.select().from(auditEvents)).length;
    await owner.patch(`/api/admin/access-grants/${grant.id}`, { statusKey: "revoked", revokedOn: "2026-10-28" }).expect(200);
    expect((await t.db.select().from(auditEvents)).length - changedBefore).toBe(1);
    expect((await feed("person", person.id))[0]).toMatchObject({
      action: "updated",
      changes: expect.arrayContaining([expect.objectContaining({ field: "status", label: "Status" })]),
    });
    expect((await feed("access_grant", grant.id)).map((item) => item.action)).toEqual(["updated", "access_granted"]);
  });

  it("orders and labels a permission's fields as OPS-148 asks: Service, Account, Permission level, Status, Scope, Granted, Revoked, Expired, People", async () => {
    const service = (await owner.get("/api/admin/services?search=GitHub").expect(200)).body.items[0];
    const person = (await owner.post("/api/admin/people", { name: "Field order" }).expect(201)).body;
    const grant = (await owner.post("/api/admin/access-grants", { serviceId: service.id, levelKey: "read" }).expect(201)).body;
    await owner
      .patch(`/api/admin/access-grants/${grant.id}`, {
        adminUserId: ownerId,
        statusKey: "active",
        resourceScope: "Repo",
        grantedOn: "2026-10-01",
        revokedOn: "2026-10-02",
        expiresOn: "2026-10-03",
        personId: person.id,
        levelKey: "write",
      })
      .expect(200);
    const [event] = await feed("access_grant", grant.id);
    expect(event!.changes.map((change) => change.label)).toEqual(["Account", "Permission level", "Status", "Scope", "Granted", "Revoked", "Expired", "People"]);
    await owner.patch(`/api/admin/access-grants/${grant.id}`, { grantedOn: "2026-10-05", expiresOn: "2026-10-04" }).expect(400);
  });

  it("lists the views of Figma p16–p17: Active services, Access review; Active permissions, Review queue", async () => {
    const service = (await owner.post("/api/admin/services", { name: "Notion", statusKey: "active" }).expect(201)).body;
    const person = (await owner.post("/api/admin/people", { name: "Reviewer" }).expect(201)).body;
    await owner
      .post("/api/admin/access-grants", { personId: person.id, serviceId: service.id, levelKey: "admin", statusKey: "needs_confirmation" })
      .expect(201);
    const names = async (path: string) =>
      ((await owner.get(path).expect(200)).body.items as { name?: string; title?: string }[]).map((item) => item.name ?? item.title);
    // GitHub was set to "Needs confirmation" above.
    expect(await names("/api/admin/services?filter=status:is:active")).toEqual(["Notion"]);
    expect(await names("/api/admin/services?filter=review:is:true")).toEqual(expect.arrayContaining(["Notion"]));
    expect(await names("/api/admin/access-grants?filter=review:is:true")).toContain("Notion / Admin");
  });

  it("has no permanent delete: services and permissions are archived (OPS-147)", async () => {
    const service = (await owner.get("/api/admin/services?search=Notion").expect(200)).body.items[0];
    const grant = (
      (await owner.get("/api/admin/access-grants?filter=review:is:true").expect(200)).body.items as { title: string; id: string; grantNumber: number }[]
    ).find((item) => item.title === "Notion / Admin")!;
    expect((await owner.delete(`/api/admin/services/${service.id}`).send({ confirm: "Notion" })).status).toBe(404);
    expect((await owner.delete(`/api/admin/access-grants/${grant.id}`).send({ confirm: `#${grant.grantNumber}` })).status).toBe(404);
    await owner.post(`/api/admin/access-grants/${grant.id}/archive`).expect(200);
    await owner.post(`/api/admin/services/${service.id}/archive`).expect(200);
    expect((await owner.get(`/api/admin/services/${service.id}`).expect(200)).body.archivedAt).toEqual(expect.any(String));
  });

  it("follows the roles: Operation admin manages grants, Treasury admin only reads, Moderator neither", async () => {
    const service = (await owner.get("/api/admin/services?search=GitHub").expect(200)).body.items[0];
    const operations = await signedInAs(t, "operations");
    await operations.post("/api/admin/access-grants", { serviceId: service.id, levelKey: "read" }).expect(201);
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
