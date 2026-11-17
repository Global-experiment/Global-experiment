import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { recordAuditEvent } from "../audit/audit.service.js";
import { auditEvents } from "../audit/audit.schema.js";
import { adminUsers } from "../auth/auth.schema.js";
import { people } from "../people/people.schema.js";
import { RevalidationService } from "../revalidation/revalidation.service.js";
import { signedInAdmin, signedInAs, type SignedInAdmin } from "../testing/admin-session.js";
import { createTestApp, type TestApp } from "../testing/test-app.js";
import { treasuryEntries } from "../treasury/treasury.schema.js";

/**
 * Rights one module checks for another (OPS-158): a person's expenses are Treasury recipients
 * (treasury.manage), Accounts never acts on the signed-in account, a record's History shows other
 * records' events only to roles that read them, and a published Treasury entry is archived or restored
 * only by a role that publishes. Every refusal changes nothing and is recorded on the account that tried.
 * Fixtures in this file only.
 */
describe("permission checks across modules (OPS-158)", () => {
  let t: TestApp;
  let owner: SignedInAdmin;
  let admin: SignedInAdmin;
  const revalidate = vi.fn(async () => true);

  beforeAll(async () => {
    t = await createTestApp({ TRUST_PROXY_HOPS: "1" }, [{ provide: RevalidationService, useValue: { revalidate } }]);
    owner = await signedInAdmin(t);
    admin = await signedInAs(t, "admin");
  });
  afterAll(async () => {
    await t.close();
  });
  beforeEach(() => revalidate.mockClear());

  const accountId = async (email: string) => (await t.db.select({ id: adminUsers.id }).from(adminUsers).where(eq(adminUsers.email, email)))[0]!.id;

  /** The account's refusals, oldest first, as the History stores them. */
  const refusals = async (email: string) =>
    (
      await t.db
        .select({ meta: auditEvents.meta })
        .from(auditEvents)
        .where(and(eq(auditEvents.entityId, await accountId(email)), eq(auditEvents.action, "permission_denied")))
        .orderBy(asc(auditEvents.occurredAt), asc(auditEvents.id))
    ).map((event) => event.meta);

  async function expense(values: Partial<typeof treasuryEntries.$inferInsert> = {}) {
    const [row] = await t.db
      .insert(treasuryEntries)
      .values({
        managedBy: "native",
        entryType: "expense",
        name: "Hosting",
        currency: "USD",
        grossAmount: -5000,
        feeAmount: 0,
        netAmount: -5000,
        cadence: "one_off",
        source: "manual",
        livemode: true,
        occurredOn: "2026-11-02",
        occurredAt: new Date("2026-11-02T12:00:00Z"),
        reviewStatusKey: "unqualified",
        publicationStatus: "published",
        publishedAt: new Date("2026-11-02T13:00:00Z"),
        ...values,
      })
      .returning();
    return row!;
  }

  const recipientOf = async (id: string) =>
    (await t.db.select({ person: treasuryEntries.recipientPersonId }).from(treasuryEntries).where(eq(treasuryEntries.id, id)))[0]!.person;

  describe("a person's expenses need treasury.manage", () => {
    it("refuses a role without it, saves nothing and records the refusal", async () => {
      const entry = await expense();
      const person = (await admin.post("/api/admin/people", { name: "Grace Hopper" }).expect(201)).body;
      const before = await refusals("admin@example.org");

      const res = await admin.patch(`/api/admin/people/${person.id}`, { name: "Grace B. Hopper", expenseIds: [entry.id] }).expect(403);
      expect(res.body.error.message).toBe("Only a Rootadmin can change an expense's recipient.");
      expect(await recipientOf(entry.id)).toBeNull();
      expect((await t.db.select({ name: people.name }).from(people).where(eq(people.id, person.id)))[0]!.name).toBe("Grace Hopper");
      await admin.post("/api/admin/people", { name: "Ada Lovelace", expenseIds: [entry.id] }).expect(403);
      expect(await recipientOf(entry.id)).toBeNull();
      expect(await t.db.select().from(people).where(eq(people.name, "Ada Lovelace"))).toEqual([]);

      expect((await refusals("admin@example.org")).slice(before.length)).toEqual([
        expect.objectContaining({ permission: "treasury.manage", route: "PATCH /api/admin/people/:id" }),
        expect.objectContaining({ permission: "treasury.manage", route: "POST /api/admin/people" }),
      ]);
      expect(revalidate).not.toHaveBeenCalled();
      // The person's other fields stay editable.
      await admin.patch(`/api/admin/people/${person.id}`, { name: "Grace B. Hopper" }).expect(200);
    });

    it("lets the Rootadmin link and unlink, and refreshes the public Treasury for a published expense", async () => {
      const entry = await expense();
      const person = (await owner.post("/api/admin/people", { name: "Katherine Johnson" }).expect(201)).body;
      await owner.patch(`/api/admin/people/${person.id}`, { expenseIds: [entry.id] }).expect(200);
      expect(await recipientOf(entry.id)).toBe(person.id);
      expect(revalidate).toHaveBeenCalledWith(["treasury"]);

      revalidate.mockClear();
      await owner.patch(`/api/admin/people/${person.id}`, { expenseIds: [] }).expect(200);
      expect(await recipientOf(entry.id)).toBeNull();
      expect(revalidate).toHaveBeenCalledWith(["treasury"]);

      revalidate.mockClear();
      const draft = await expense({ publicationStatus: "unpublished", publishedAt: null });
      await owner.patch(`/api/admin/people/${person.id}`, { expenseIds: [draft.id] }).expect(200);
      expect(await recipientOf(draft.id)).toBe(person.id);
      expect(revalidate).not.toHaveBeenCalled();
    });
  });

  describe("Accounts never acts on the signed-in account", () => {
    it("refuses the Rootadmin's own link, deactivation and role change, records each, and changes nothing", async () => {
      const self = await accountId("owner@example.org");
      const before = await refusals("owner@example.org");

      const link = await owner.post(`/api/admin/accounts/${self}/link`).expect(403);
      expect(link.body.error.message).toMatch(/Profile settings/);
      expect((await owner.post(`/api/admin/accounts/${self}/deactivate`).expect(403)).body.error.message).toMatch(/Profile settings/);
      expect((await owner.patch(`/api/admin/accounts/${self}`, { role: "admin" }).expect(403)).body.error.message).toMatch(/Profile settings/);

      const [account] = await t.db.select().from(adminUsers).where(eq(adminUsers.id, self));
      expect(account).toMatchObject({ role: "owner", status: "active" });
      expect(
        await t.db
          .select()
          .from(auditEvents)
          .where(and(eq(auditEvents.entityId, self), eq(auditEvents.action, "link_created"))),
      ).toEqual([]);
      expect((await refusals("owner@example.org")).slice(before.length)).toEqual([
        expect.objectContaining({ permission: "another account", route: "POST /api/admin/accounts/:id/link" }),
        expect.objectContaining({ permission: "another account", route: "POST /api/admin/accounts/:id/deactivate" }),
        expect.objectContaining({ permission: "another account", route: "PATCH /api/admin/accounts/:id" }),
      ]);
      // The session still works: nothing was revoked.
      await owner.get("/api/admin/auth/session").expect(200);
      // Other profile fields can still be saved from the record.
      await owner.patch(`/api/admin/accounts/${self}`, { description: "Runs the platform." }).expect(200);
    });

    it("still does all three on another account", async () => {
      await signedInAs(t, "tech");
      const other = await accountId("tech@example.org");
      await owner.post(`/api/admin/accounts/${other}/link`).expect(201);
      await owner.patch(`/api/admin/accounts/${other}`, { role: "moderation" }).expect(200);
      await owner.post(`/api/admin/accounts/${other}/deactivate`).expect(200);
      expect(await t.db.select({ role: adminUsers.role, status: adminUsers.status }).from(adminUsers).where(eq(adminUsers.id, other))).toEqual([
        { role: "moderation", status: "deactivated" },
      ]);
    });
  });

  describe("a record's History shows other records' events only to roles that read them", () => {
    it("hides an access-grant event on a person from a role without access.read, and shows it to one with it", async () => {
      const person = (await owner.post("/api/admin/people", { name: "Margaret Hamilton" }).expect(201)).body;
      const actor = { type: "automation", label: "Test" } as const;
      await recordAuditEvent(t.db, {
        entityType: "access_grant",
        entityId: randomUUID(),
        action: "access_granted",
        actor,
        source: "admin",
        meta: { label: "#1 · GitHub admin", related: [{ type: "person", id: person.id }] },
      });
      await recordAuditEvent(t.db, {
        entityType: "treasury_entry",
        entityId: randomUUID(),
        action: "updated",
        actor,
        source: "admin",
        meta: { label: "EXP-1", related: [{ type: "person", id: person.id }] },
      });
      const actions = (body: { items: { action: string }[] }) => body.items.map((item) => item.action).sort();

      // Communication admin: reads People and the Treasury, not access grants.
      const communication = await signedInAs(t, "communication");
      const hidden = (await communication.get(`/api/admin/history/person/${person.id}`).expect(200)).body;
      expect(actions(hidden)).toEqual(["created", "updated"]);
      expect(hidden.total).toBe(2);

      // Moderator: reads People only. The Admin has history.read and sees every event.
      const moderation = await signedInAs(t, "moderation");
      expect(actions((await moderation.get(`/api/admin/history/person/${person.id}`).expect(200)).body)).toEqual(["created"]);
      expect(actions((await admin.get(`/api/admin/history/person/${person.id}`).expect(200)).body)).toEqual(["access_granted", "created", "updated"]);
    });
  });

  describe("a published Treasury entry needs treasury.publish to be archived or restored", () => {
    it("refuses a role without it, changes nothing and records the refusal", async () => {
      const entry = await expense();
      const before = await refusals("admin@example.org");
      expect((await admin.post(`/api/admin/treasury/${entry.id}/archive`).expect(403)).body.error.message).toMatch(/published/);
      expect((await t.db.select().from(treasuryEntries).where(eq(treasuryEntries.id, entry.id)))[0]!.archivedAt).toBeNull();

      const archived = await expense({ archivedAt: new Date("2026-11-03T09:00:00Z") });
      await admin.post(`/api/admin/treasury/${archived.id}/restore`).expect(403);
      expect((await t.db.select().from(treasuryEntries).where(eq(treasuryEntries.id, archived.id)))[0]!.archivedAt).not.toBeNull();

      expect((await refusals("admin@example.org")).slice(before.length)).toEqual([
        expect.objectContaining({ permission: "treasury.publish", route: "POST /api/admin/treasury/:id/archive" }),
        expect.objectContaining({ permission: "treasury.publish", route: "POST /api/admin/treasury/:id/restore" }),
      ]);
      expect(revalidate).not.toHaveBeenCalled();
    });

    it("lets a role that publishes archive and restore it, and an unpublished entry stays treasury.update", async () => {
      const entry = await expense();
      const treasurer = await signedInAs(t, "treasury");
      await treasurer.post(`/api/admin/treasury/${entry.id}/archive`).expect(200);
      await treasurer.post(`/api/admin/treasury/${entry.id}/restore`).expect(200);
      expect(revalidate).toHaveBeenCalledTimes(2);

      const draft = await expense({ publicationStatus: "unpublished", publishedAt: null });
      await admin.post(`/api/admin/treasury/${draft.id}/archive`).expect(200);
      await admin.post(`/api/admin/treasury/${draft.id}/restore`).expect(200);
    });
  });
});
