import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { and, eq } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditEvents } from "../audit/audit.schema.js";
import { adminSessions, adminTokens, adminUsers } from "../auth/auth.schema.js";
import { CLOCK } from "../common/clock/clock.js";
import { FILE_STORAGE, LocalDiskStorage } from "../files/file-storage.js";
import { signedInAdmin, signedInAs, signInWith, type SignedInAdmin } from "../testing/admin-session.js";
import { createTestApp, TEST_ORIGIN, type TestApp } from "../testing/test-app.js";

/**
 * Accounts (admin-desktop.pdf p15, p18; decisions 13–14): invitations and
 * reset links that work once within 72 hours, passwords the invitee sets,
 * roles, the last Rootadmin always kept, deactivation, and each admin's own
 * profile — every change in the account's history.
 */
describe("admin accounts", () => {
  let t: TestApp;
  let owner: SignedInAdmin;
  let files: string;
  let now = new Date("2026-10-28T09:00:00Z");
  const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a0000000000049454e44ae426082", "hex");

  beforeAll(async () => {
    files = await mkdtemp(join(tmpdir(), "ge-accounts-"));
    t = await createTestApp({ TRUST_PROXY_HOPS: "1", PUBLIC_SITE_URL: "https://admin.example.org" }, [
      { provide: CLOCK, useValue: () => now },
      { provide: FILE_STORAGE, useValue: new LocalDiskStorage(files) },
    ]);
    owner = await signedInAdmin(t);
  });
  afterAll(async () => {
    await t.close();
    await rm(files, { recursive: true, force: true });
  });

  const anonymous = () => request(t.app.getHttpServer());
  const tokenOf = (link: string) => link.split("#")[1]!;
  const inspect = (token: string) => anonymous().post("/api/admin/auth/tokens/inspect").set("origin", TEST_ORIGIN).set("x-forwarded-for", "203.0.113.9").send({ token });
  let ip = 10;
  const accept = (token: string, password: string) =>
    anonymous().post("/api/admin/auth/tokens/accept").set("origin", TEST_ORIGIN).set("x-forwarded-for", `203.0.113.${++ip}`).send({ token, password });
  const login = (email: string, password: string) =>
    anonymous().post("/api/admin/auth/login").set("origin", TEST_ORIGIN).set("x-forwarded-for", `203.0.114.${++ip}`).send({ email, password });
  const historyOf = async (id: string) => (await owner.get(`/api/admin/history/admin_user/${id}`).expect(200)).body.items.map((item: { action: string }) => item.action);

  it("invites an account: a one-time link in the URL fragment, valid 72 hours, the password set by the invitee", async () => {
    const invited = (await owner.post("/api/admin/accounts", { email: "candide@example.org", displayName: "Candide", role: "owner" }).expect(201)).body;
    expect(invited.link).toMatch(/^https:\/\/admin\.example\.org\/admin\/welcome#[A-Za-z0-9_-]{43}$/);
    expect(invited.expiresAt).toBe("2026-10-31T09:00:00.000Z");
    expect(invited.account).toMatchObject({ name: "Candide", status: "invited", role: { key: "owner", label: "Rootadmin" }, accountId: expect.stringMatching(/^GE-\d{6}$/), pendingLink: { purpose: "invite" } });
    // Only the hash is stored.
    const [token] = await t.db.select().from(adminTokens).where(eq(adminTokens.adminUserId, invited.account.id));
    expect(token!.tokenHash).not.toContain(tokenOf(invited.link));
    // Invited: can't sign in yet.
    await login("candide@example.org", "anything at all here").expect(401);

    expect((await inspect(tokenOf(invited.link)).expect(200)).body).toMatchObject({ purpose: "invite", email: "candide@example.org", name: "Candide" });
    // Strength rules, from the API itself.
    const weak = await accept(tokenOf(invited.link), "candide12345").expect(400);
    expect(weak.body.error.details.issues.map((issue: { message: string }) => issue.message)).toEqual(expect.arrayContaining([expect.stringMatching(/three of|20 characters/), "Don't use your email or your name."]));
    await accept(tokenOf(invited.link), "Gentle rain falls on 9 hills").expect(200);
    await login("candide@example.org", "Gentle rain falls on 9 hills").expect(204);
    // One time only.
    await inspect(tokenOf(invited.link)).expect(404);
    expect((await accept(tokenOf(invited.link), "Another strong pass 77!")).status).toBe(404);
    expect(await historyOf(invited.account.id)).toEqual(expect.arrayContaining(["invited", "activated"]));
  });

  it("refuses a link after 72 hours, and a link replaced by a newer one", async () => {
    const invited = (await owner.post("/api/admin/accounts", { email: "late@example.org", role: "operations" }).expect(201)).body;
    const second = (await owner.post(`/api/admin/accounts/${invited.account.id}/link`).expect(201)).body;
    // The first link stopped working when the second was made.
    await inspect(tokenOf(invited.link)).expect(404);
    now = new Date(now.getTime() + 72 * 3_600_000 + 60_000);
    const expired = await accept(tokenOf(second.link), "Gentle rain falls on 9 hills");
    expect(expired.status).toBe(404);
    expect(expired.body.error.message).toBe("This link has expired or was already used.");
    now = new Date("2026-10-28T09:00:00Z");
  });

  it("resets a password with a link for an active account, signing it out everywhere", async () => {
    const operations = await signedInAs(t, "operations");
    const [account] = await t.db.select().from(adminUsers).where(eq(adminUsers.email, "operations@example.org"));
    const reset = (await owner.post(`/api/admin/accounts/${account!.id}/link`).expect(201)).body;
    expect(reset.link).toMatch(/\/admin\/reset-password#/);
    await accept(tokenOf(reset.link), "A completely new phrase 2026").expect(200);
    await operations.get("/api/admin/auth/session").expect(401);
    await login("operations@example.org", "A completely new phrase 2026").expect(204);
    expect(await historyOf(account!.id)).toEqual(expect.arrayContaining(["link_created", "password_changed"]));
  });

  it("never deactivates or demotes the last active Rootadmin", async () => {
    // Two Rootadmins exist (the test owner, and Candide from the first test): one may go.
    const list = (await owner.get("/api/admin/accounts?filter=role:is:owner").expect(200)).body.items as { id: string; email: string }[];
    const candide = list.find((account) => account.email === "candide@example.org")!;
    await owner.post(`/api/admin/accounts/${candide.id}/deactivate`).expect(200);
    const self = list.find((account) => account.email === "owner@example.org")!;
    const refused = await owner.post(`/api/admin/accounts/${self.id}/deactivate`).expect(409);
    expect(refused.body.error.message).toMatch(/last active Rootadmin/);
    await owner.patch(`/api/admin/accounts/${self.id}`, { role: "admin" }).expect(409);
    // Reactivated, Candide is a Rootadmin again: now the owner could be demoted.
    await owner.post(`/api/admin/accounts/${candide.id}/reactivate`).expect(200);
    expect((await owner.get(`/api/admin/accounts/${candide.id}`).expect(200)).body.status).toBe("active");
  });

  it("a deactivated account can't sign in, loses its sessions and links; reactivation brings it back", async () => {
    const tech = await signedInAs(t, "tech");
    const [account] = await t.db.select().from(adminUsers).where(eq(adminUsers.email, "tech@example.org"));
    await owner.post(`/api/admin/accounts/${account!.id}/deactivate`).expect(200);
    await tech.get("/api/admin/auth/session").expect(401);
    await login("tech@example.org", "Another long passphrase 42").expect(401);
    await owner.post(`/api/admin/accounts/${account!.id}/link`).expect(409);
    await owner.post(`/api/admin/accounts/${account!.id}/reactivate`).expect(200);
    await login("tech@example.org", "Another long passphrase 42").expect(204);
    expect(await historyOf(account!.id)).toEqual(expect.arrayContaining(["deactivated", "reactivated"]));
  });

  it("a new role applies at once (the account signs in again) and is in the history", async () => {
    const compliance = await signedInAs(t, "compliance");
    const [account] = await t.db.select().from(adminUsers).where(eq(adminUsers.email, "compliance@example.org"));
    await compliance.get("/api/admin/accounts").expect(200); // compliance reads accounts
    await owner.patch(`/api/admin/accounts/${account!.id}`, { role: "moderation", note: "Moves to moderation" }).expect(200);
    await compliance.get("/api/admin/accounts").expect(401);
    const [event] = (await owner.get(`/api/admin/history/admin_user/${account!.id}`).expect(200)).body.items;
    expect(event.changes.map((change: { field: string }) => change.field).sort()).toEqual(["note", "role"]);
  });

  it("only accounts.manage changes accounts: Admin reads, Treasury admin neither", async () => {
    const admin = await signedInAs(t, "admin");
    await admin.get("/api/admin/accounts").expect(200);
    await admin.post("/api/admin/accounts", { email: "x@example.org", role: "admin" }).expect(403);
    const treasury = await signedInAs(t, "treasury");
    await treasury.get("/api/admin/accounts").expect(403);
    await owner.post("/api/admin/accounts", { email: "owner@example.org", role: "admin" }).expect(409); // email in use
  });

  it("lists the views of Figma p15: All, Active, Invited, Deactivated", async () => {
    const statuses = async (query: string) => ((await owner.get(`/api/admin/accounts?pageSize=100${query}`).expect(200)).body.items as { status: string }[]).map((account) => account.status);
    expect(new Set(await statuses(""))).toEqual(new Set(["active", "invited"]));
    expect(await statuses("&filter=status:is:invited")).toEqual(expect.arrayContaining(["invited"]));
    expect(new Set(await statuses("&filter=status:is:active"))).toEqual(new Set(["active"]));
  });

  describe("profile settings (p18)", () => {
    it("saves the display name, time zone and appearance, in the history; refuses an unknown zone", async () => {
      const profile = (await owner.patch("/api/admin/profile", { displayName: "Stanley", timeZone: "Europe/Zurich", appearance: "light" }).expect(200)).body;
      expect(profile).toMatchObject({ displayName: "Stanley", timeZone: "Europe/Zurich", appearance: "light", accountId: expect.stringMatching(/^GE-\d{6}$/) });
      expect(profile.permissionKeys).toContain("accounts.manage");
      await owner.patch("/api/admin/profile", { timeZone: "Mars/Olympus" }).expect(400);
      const session = (await owner.get("/api/admin/auth/session").expect(200)).body.admin;
      expect(session).toMatchObject({ displayName: "Stanley", timeZone: "Europe/Zurich", appearance: "light" });
      const [event] = (await owner.get(`/api/admin/history/admin_user/${session.id}`).expect(200)).body.items;
      expect(event.changes.map((change: { field: string }) => change.field).sort()).toEqual(["appearance", "displayName", "timeZone"]);
    });

    it("takes a PNG, JPEG or WebP picture up to 2 MB, judged from its bytes; serves it to signed-in admins", async () => {
      await owner.upload("/api/admin/profile/picture", "file", PNG, "me.png").expect(201);
      const session = (await owner.get("/api/admin/auth/session").expect(200)).body.admin;
      expect(session.hasPicture).toBe(true);
      const picture = await owner.get(`/api/admin/accounts/${session.id}/picture`).expect(200);
      expect(picture.headers["content-type"]).toBe("image/png");
      expect(picture.headers["x-content-type-options"]).toBe("nosniff");
      expect((await owner.upload("/api/admin/profile/picture", "file", Buffer.from("<svg onload=alert(1)></svg>"), "x.svg")).status).toBe(400);
      expect((await owner.upload("/api/admin/profile/picture", "file", Buffer.concat([PNG, Buffer.alloc(2 * 1024 * 1024)]), "big.png")).status).toBe(413);
      await anonymous().get(`/api/admin/accounts/${session.id}/picture`).expect(401);
      await owner.delete("/api/admin/profile/picture").expect(200);
      expect((await owner.get("/api/admin/auth/session").expect(200)).body.admin.hasPicture).toBe(false);
    });

    it("changes the email and the password only with the current password; a new password signs out the other sessions", async () => {
      await owner.post("/api/admin/profile/email", { currentPassword: "wrong", email: "new@example.org" }).expect(403);
      await owner.post("/api/admin/profile/email", { currentPassword: "a long and unique passphrase", email: "candide@example.org" }).expect(409);
      // Another session of the same account, to see it signed out.
      const other = await signInWith(t, "owner@example.org", "a long and unique passphrase");
      await owner.post("/api/admin/profile/password", { currentPassword: "a long and unique passphrase", newPassword: "short" }).expect(400);
      await owner.post("/api/admin/profile/password", { currentPassword: "a long and unique passphrase", newPassword: "Gardens keep 3 quiet rivers" }).expect(204);
      await owner.get("/api/admin/auth/session").expect(200);
      await other.get("/api/admin/auth/session").expect(401);
      const [account] = await t.db.select().from(adminUsers).where(eq(adminUsers.email, "owner@example.org"));
      const events = await t.db.select().from(auditEvents).where(and(eq(auditEvents.entityId, account!.id), eq(auditEvents.action, "password_changed")));
      expect(events).toHaveLength(1);
      expect(JSON.stringify(events)).not.toMatch(/quiet rivers|scrypt/);
    });

    it("deactivates the own account (\"Delete account\") with the password, and never the last Rootadmin", async () => {
      const moderator = await signedInAs(t, "moderation", "leaving@example.org");
      await moderator.post("/api/admin/profile/deactivate", { currentPassword: "Another long passphrase 42" }).expect(204);
      await moderator.get("/api/admin/auth/session").expect(401);
      const [left] = await t.db.select().from(adminUsers).where(eq(adminUsers.email, "leaving@example.org"));
      expect(left!.status).toBe("deactivated");
      expect(await t.db.select().from(adminSessions).where(and(eq(adminSessions.adminUserId, left!.id)))).toSatisfy((rows: { revokedAt: Date | null }[]) => rows.every((row) => row.revokedAt));
    });
  });
});
