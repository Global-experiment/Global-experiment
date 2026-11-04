import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { and, eq } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditEvents } from "../audit/audit.schema.js";
import { adminInvitations, adminSessions, adminUsers } from "../auth/auth.schema.js";
import { CLOCK } from "../common/clock/clock.js";
import { expertiseDomains, expertiseFields, expertiseItems } from "../expertise/expertise.schema.js";
import { FILE_STORAGE, LocalDiskStorage } from "../files/file-storage.js";
import { signedInAdmin, signedInAs, signInWith, type SignedInAdmin } from "../testing/admin-session.js";
import { createTestApp, TEST_ORIGIN, type TestApp } from "../testing/test-app.js";

/**
 * Accounts (admin-desktop.pdf p15, p18; decisions 13–14), after Candide's
 * first feedback (2026-11-03): invitation links anyone signs up with —
 * single use, 7 days, revocable, hashed — and accounts made with them have
 * no role until a Rootadmin gives one (OPS-141); a profile description
 * (OPS-144) and the account's own expertise (OPS-135), set by the holder or
 * a Rootadmin; no note (OPS-142), no link to People (OPS-136). Reset links,
 * the last Rootadmin kept, deactivation. Fixtures in this file only.
 */
describe("admin accounts", () => {
  let t: TestApp;
  let owner: SignedInAdmin;
  let files: string;
  let now = new Date("2026-11-03T09:00:00Z");
  let expertise: { id: string; name: string }[] = [];
  const PNG = Buffer.from(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a0000000000049454e44ae426082",
    "hex",
  );

  beforeAll(async () => {
    files = await mkdtemp(join(tmpdir(), "ge-accounts-"));
    t = await createTestApp({ TRUST_PROXY_HOPS: "1", PUBLIC_SITE_URL: "https://admin.example.org" }, [
      { provide: CLOCK, useValue: () => now },
      { provide: FILE_STORAGE, useValue: new LocalDiskStorage(files) },
    ]);
    owner = await signedInAdmin(t);
    const [domain] = await t.db.insert(expertiseDomains).values({ name: "Government", stableId: "domain.07.government", statusKey: "active" }).returning();
    const [field] = await t.db
      .insert(expertiseFields)
      .values({ name: "Participation", domainId: domain!.id, stableId: "field.07.02.participation", statusKey: "active" })
      .returning();
    expertise = await t.db
      .insert(expertiseItems)
      .values([
        { name: "Citizen assemblies", fieldId: field!.id, stableId: "07.02.citizen_assemblies", statusKey: "active" },
        { name: "Participatory budgeting", fieldId: field!.id, stableId: "07.02.participatory_budgeting", statusKey: "active" },
      ])
      .returning({ id: expertiseItems.id, name: expertiseItems.name });
  });
  afterAll(async () => {
    await t.close();
    await rm(files, { recursive: true, force: true });
  });

  const anonymous = () => request(t.app.getHttpServer());
  const tokenOf = (link: string) => link.split("#")[1]!;
  let ip = 10;
  const post = (path: string, body: object, from = `203.0.113.${++ip}`) =>
    anonymous().post(path).set("origin", TEST_ORIGIN).set("x-forwarded-for", from).send(body);
  const inspectInvitation = (token: string) => post("/api/admin/auth/invitations/inspect", { token });
  const signUp = (token: string, email: string, password: string, from?: string) =>
    post("/api/admin/auth/invitations/accept", { token, email, password }, from);
  const accept = (token: string, password: string) => post("/api/admin/auth/tokens/accept", { token, password });
  const login = (email: string, password: string) => post("/api/admin/auth/login", { email, password });
  const historyOf = async (id: string) =>
    (await owner.get(`/api/admin/history/admin_user/${id}`).expect(200)).body.items.map((item: { action: string }) => item.action);
  const cookieOf = (response: request.Response) => (response.headers["set-cookie"] as unknown as string[]).map((cookie) => cookie.split(";")[0]).join("; ");
  const as = (cookie: string) => ({ get: (path: string) => anonymous().get(path).set("cookie", cookie).set("origin", TEST_ORIGIN) });

  describe("invitation links (OPS-141)", () => {
    it('"New invitation link" asks nothing: the link is shown once, hashed, valid 7 days; whoever opens it makes an account with no role and lands signed in', async () => {
      const made = (await owner.post("/api/admin/invitations").expect(201)).body;
      expect(made.link).toMatch(/^https:\/\/admin\.example\.org\/admin\/join#[A-Za-z0-9_-]{43}$/);
      expect(made.invitation).toMatchObject({ status: "pending", expiresAt: "2026-11-10T09:00:00.000Z", createdBy: "owner", account: null });
      // Only the hash is stored; the list never shows the link again.
      const [stored] = await t.db.select().from(adminInvitations).where(eq(adminInvitations.id, made.invitation.id));
      expect(stored!.tokenHash).not.toContain(tokenOf(made.link));
      expect(JSON.stringify((await owner.get("/api/admin/invitations").expect(200)).body)).not.toContain(tokenOf(made.link));

      expect((await inspectInvitation(tokenOf(made.link)).expect(200)).body).toEqual({ expiresAt: "2026-11-10T09:00:00.000Z" });
      // The password rules apply; an email already in use is refused.
      const weak = await signUp(tokenOf(made.link), "newcomer@example.org", "newcomer12345").expect(400);
      expect(weak.body.error.details.issues.map((issue: { message: string }) => issue.message)).toContain("Don't use your email or your name.");
      await signUp(tokenOf(made.link), "owner@example.org", "Gentle rain falls on 9 hills").expect(409);
      const created = await signUp(tokenOf(made.link), "newcomer@example.org", "Gentle rain falls on 9 hills").expect(204);
      const session = (await as(cookieOf(created)).get("/api/admin/auth/session").expect(200)).body.admin;
      expect(session).toMatchObject({ email: "newcomer@example.org", role: null, roleLabel: "No role", permissions: [] });
      // No rights until a Rootadmin gives a role: only the own profile.
      expect((await as(cookieOf(created)).get("/api/admin/people")).status).toBe(403);
      const profile = (await as(cookieOf(created)).get("/api/admin/profile").expect(200)).body;
      expect(profile).toMatchObject({ role: null, status: "active", description: null, expertise: [], permissions: [], displayName: null });
      // Used once.
      await inspectInvitation(tokenOf(made.link)).expect(404);
      expect((await signUp(tokenOf(made.link), "second@example.org", "Gentle rain falls on 9 hills")).status).toBe(404);
      const [listed] = (await owner.get("/api/admin/invitations").expect(200)).body;
      expect(listed).toMatchObject({ id: made.invitation.id, status: "used", account: { id: session.id, name: "newcomer" } });
      // Its refused request is logged too.
      expect(await historyOf(session.id)).toEqual(["permission_denied", "created"]);
      expect((await owner.get("/api/admin/accounts?filter=role:is:none").expect(200)).body.items.map((account: { email: string }) => account.email)).toEqual([
        "newcomer@example.org",
      ]);

      // A Rootadmin gives a role: it applies at the next sign-in.
      await owner.patch(`/api/admin/accounts/${session.id}`, { role: "operations" }).expect(200);
      await as(cookieOf(created)).get("/api/admin/auth/session").expect(401);
      await login("newcomer@example.org", "Gentle rain falls on 9 hills").expect(204);
    });

    it("refuses a link after 7 days, and a revoked one; a used one can't be revoked", async () => {
      const late = (await owner.post("/api/admin/invitations").expect(201)).body;
      const revoked = (await owner.post("/api/admin/invitations").expect(201)).body;
      expect((await owner.post(`/api/admin/invitations/${revoked.invitation.id}/revoke`).expect(200)).body.status).toBe("revoked");
      expect((await signUp(tokenOf(revoked.link), "revoked@example.org", "Gentle rain falls on 9 hills")).status).toBe(404);
      now = new Date(now.getTime() + 7 * 86_400_000 + 60_000);
      const expired = await signUp(tokenOf(late.link), "late@example.org", "Gentle rain falls on 9 hills");
      expect(expired.status).toBe(404);
      expect(expired.body.error.message).toBe("This link has expired or was already used.");
      now = new Date("2026-11-03T09:00:00Z");
      const used = (await owner.get("/api/admin/invitations").expect(200)).body.find((invitation: { status: string }) => invitation.status === "used");
      await owner.post(`/api/admin/invitations/${used.id}/revoke`).expect(409);
      expect((await t.db.select().from(adminUsers).where(eq(adminUsers.email, "late@example.org"))).length).toBe(0);
      const actions = (await t.db.select().from(auditEvents).where(eq(auditEvents.entityType, "admin_invitation"))).map((event) => event.action);
      expect(actions).toEqual(expect.arrayContaining(["link_created", "link_revoked"]));
    });

    it("signing up is rate-limited like sign-in", async () => {
      const made = (await owner.post("/api/admin/invitations").expect(201)).body;
      const statuses: number[] = [];
      for (let attempt = 0; attempt < 6; attempt++) statuses.push((await signUp(tokenOf(made.link), "x@example.org", "short", "198.51.100.77")).status);
      expect(statuses.slice(0, 5).every((status) => status === 400)).toBe(true);
      expect(statuses[5]).toBe(429);
    });

    it('only a Rootadmin makes, lists and revokes invitation links; there is no "create account with email" any more', async () => {
      const admin = await signedInAs(t, "admin");
      await admin.post("/api/admin/invitations").expect(403);
      await admin.get("/api/admin/invitations").expect(403);
      await anonymous().post("/api/admin/invitations").set("origin", TEST_ORIGIN).expect(401);
      expect((await owner.post("/api/admin/accounts", { email: "x@example.org", role: "admin" })).status).toBe(404);
    });
  });

  it("an account invited before OPS-141 still gets a link and sets its password; an active one gets a reset link", async () => {
    const [invited] = await t.db
      .insert(adminUsers)
      .values({ email: "earlier@example.org", displayName: "Earlier", role: "treasury", status: "invited", passwordHash: null })
      .returning();
    const link = (await owner.post(`/api/admin/accounts/${invited!.id}/link`).expect(201)).body;
    expect(link.link).toMatch(/\/admin\/welcome#/);
    await accept(tokenOf(link.link), "Gentle rain falls on 9 hills").expect(200);
    await login("earlier@example.org", "Gentle rain falls on 9 hills").expect(204);

    const operations = await signedInAs(t, "operations", "ops2@example.org");
    const [account] = await t.db.select().from(adminUsers).where(eq(adminUsers.email, "ops2@example.org"));
    const reset = (await owner.post(`/api/admin/accounts/${account!.id}/link`).expect(201)).body;
    expect(reset.link).toMatch(/\/admin\/reset-password#/);
    await accept(tokenOf(reset.link), "A completely new phrase 2026").expect(200);
    await operations.get("/api/admin/auth/session").expect(401);
    expect(await historyOf(account!.id)).toEqual(expect.arrayContaining(["link_created", "password_changed"]));
  });

  it("never deactivates or demotes the last active Rootadmin", async () => {
    const [second] = await t.db.insert(adminUsers).values({ email: "root2@example.org", role: "owner", status: "active", passwordHash: "x" }).returning();
    await owner.post(`/api/admin/accounts/${second!.id}/deactivate`).expect(200);
    const self = (await owner.get("/api/admin/accounts?filter=role:is:owner").expect(200)).body.items.find(
      (account: { email: string }) => account.email === "owner@example.org",
    );
    expect((await owner.post(`/api/admin/accounts/${self.id}/deactivate`).expect(409)).body.error.message).toMatch(/last active Rootadmin/);
    await owner.patch(`/api/admin/accounts/${self.id}`, { role: "admin" }).expect(409);
    await owner.post(`/api/admin/accounts/${second!.id}/reactivate`).expect(200);
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

  describe("description and expertise (OPS-144, OPS-135); no note, no People link (OPS-142, OPS-136)", () => {
    it("the account holder sets their own description and expertise from Profile settings", async () => {
      const profile = (
        await owner
          .patch("/api/admin/profile", { description: "  Runs the treasury reviews.  ", expertiseIds: [expertise[1]!.id, expertise[0]!.id] })
          .expect(200)
      ).body;
      expect(profile.description).toBe("Runs the treasury reviews.");
      expect(profile.expertise.map((item: { name: string }) => item.name)).toEqual(["Participatory budgeting", "Citizen assemblies"]);
      expect(profile.expertise[0]).toMatchObject({ field: { name: "Participation" }, domain: { name: "Government" } });
      const [event] = (await owner.get(`/api/admin/history/admin_user/${profile.id}`).expect(200)).body.items;
      expect(event.changes.map((change: { field: string }) => change.field).sort()).toEqual(["description", "expertise"]);
      await owner.patch("/api/admin/profile", { expertiseIds: ["00000000-0000-4000-8000-000000000000"] }).expect(400);
      await owner.patch("/api/admin/profile", { description: "x".repeat(5001) }).expect(400);
      // Anyone, whatever their role, edits their own.
      const moderator = await signedInAs(t, "moderation", "mod-profile@example.org");
      expect(
        (await moderator.patch("/api/admin/profile", { description: "Moderates feedback", expertiseIds: [expertise[0]!.id] }).expect(200)).body.description,
      ).toBe("Moderates feedback");
    });

    it("a Rootadmin sets them for other accounts; no other role can, not even Admin", async () => {
      const [account] = await t.db.select().from(adminUsers).where(eq(adminUsers.email, "mod-profile@example.org"));
      const updated = (
        await owner.patch(`/api/admin/accounts/${account!.id}`, { description: "Moderation lead", expertiseIds: [expertise[1]!.id] }).expect(200)
      ).body;
      expect(updated).toMatchObject({ description: "Moderation lead", expertise: [{ name: "Participatory budgeting" }] });
      expect((await owner.get(`/api/admin/accounts/${account!.id}`).expect(200)).body.description).toBe("Moderation lead");
      const admin = await signedInAs(t, "admin");
      await admin.patch(`/api/admin/accounts/${account!.id}`, { description: "Not mine to change" }).expect(403);
      const moderator = await signInWith(t, "mod-profile@example.org", "Another long passphrase 42");
      await moderator.patch(`/api/admin/accounts/${account!.id}`, { description: "Me via accounts" }).expect(403);
      expect((await owner.get(`/api/admin/accounts/${account!.id}`).expect(200)).body.description).toBe("Moderation lead");
    });

    it("has no note and no link to People any more", async () => {
      const [account] = await t.db.select().from(adminUsers).where(eq(adminUsers.email, "mod-profile@example.org"));
      await owner.patch(`/api/admin/accounts/${account!.id}`, { note: "x" }).expect(400);
      await owner.patch(`/api/admin/accounts/${account!.id}`, { personId: "00000000-0000-4000-8000-000000000000" }).expect(400);
      const record = (await owner.get(`/api/admin/accounts/${account!.id}`).expect(200)).body;
      expect(record).not.toHaveProperty("note");
      expect(record).not.toHaveProperty("person");
    });
  });

  it("a new role applies at once (the account signs in again) and is in the history", async () => {
    const compliance = await signedInAs(t, "compliance");
    const [account] = await t.db.select().from(adminUsers).where(eq(adminUsers.email, "compliance@example.org"));
    await compliance.get("/api/admin/accounts").expect(200);
    await owner.patch(`/api/admin/accounts/${account!.id}`, { role: "moderation" }).expect(200);
    await compliance.get("/api/admin/accounts").expect(401);
    const [event] = (await owner.get(`/api/admin/history/admin_user/${account!.id}`).expect(200)).body.items;
    expect(event.changes.map((change: { field: string }) => change.field)).toEqual(["role"]);
  });

  it("only accounts.manage changes accounts: Admin reads, Treasury admin neither", async () => {
    const admin = await signedInAs(t, "admin");
    await admin.get("/api/admin/accounts").expect(200);
    const treasury = await signedInAs(t, "treasury");
    await treasury.get("/api/admin/accounts").expect(403);
  });

  it("lists the views of Figma p15: All, Active, Invited, Deactivated", async () => {
    const statuses = async (query: string) =>
      ((await owner.get(`/api/admin/accounts?pageSize=100${query}`).expect(200)).body.items as { status: string }[]).map((account) => account.status);
    expect(new Set(await statuses(""))).toEqual(new Set(["active"]));
    expect(new Set(await statuses("&filter=status:is:active"))).toEqual(new Set(["active"]));
    expect(await statuses("&filter=status:is:invited")).toEqual([]);
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

    it("archives a removed or replaced picture instead of deleting it (ADR 017); a previous picture can be used again", async () => {
      const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]);
      await owner.upload("/api/admin/profile/picture", "file", PNG, "first.png").expect(201);
      await owner.upload("/api/admin/profile/picture", "file", JPEG, "second.jpg").expect(201);
      let previous = (await owner.get("/api/admin/profile/pictures").expect(200)).body;
      expect(previous).toHaveLength(1);
      const first = await owner.get(`/api/admin/profile/pictures/${previous[0].id}`).expect(200);
      expect(first.headers["content-type"]).toBe("image/png");

      await owner.delete("/api/admin/profile/picture").expect(200);
      previous = (await owner.get("/api/admin/profile/pictures").expect(200)).body;
      expect(previous).toHaveLength(2);
      const session = (await owner.get("/api/admin/auth/session").expect(200)).body.admin;
      expect(session.hasPicture).toBe(false);
      let [event] = (await owner.get(`/api/admin/history/admin_user/${session.id}`).expect(200)).body.items;
      expect(event).toMatchObject({ action: "file_archived", meta: { file: { kind: "picture" } } });

      const types = await Promise.all(
        previous.map(async (picture: { id: string }) => (await owner.get(`/api/admin/profile/pictures/${picture.id}`)).headers["content-type"]),
      );
      expect([...types].sort()).toEqual(["image/jpeg", "image/png"]);
      const png = previous[types.indexOf("image/png")];
      await owner.post(`/api/admin/profile/pictures/${png.id}/restore`).expect(200);
      expect((await owner.get("/api/admin/auth/session").expect(200)).body.admin.hasPicture).toBe(true);
      expect((await owner.get(`/api/admin/accounts/${session.id}/picture`).expect(200)).headers["content-type"]).toBe("image/png");
      [event] = (await owner.get(`/api/admin/history/admin_user/${session.id}`).expect(200)).body.items;
      expect(event).toMatchObject({ action: "file_restored", meta: { file: { kind: "picture", id: png.id } } });
      expect((await owner.get("/api/admin/profile/pictures").expect(200)).body).toHaveLength(1);

      // Only one's own pictures.
      const other = await signedInAs(t, "admin");
      await other.get(`/api/admin/profile/pictures/${png.id}`).expect(404);
      await other.post(`/api/admin/profile/pictures/${png.id}/restore`).expect(404);
    });

    it("changes the email and the password only with the current password; a new password signs out the other sessions", async () => {
      await owner.post("/api/admin/profile/email", { currentPassword: "wrong", email: "new@example.org" }).expect(403);
      await owner.post("/api/admin/profile/email", { currentPassword: "a long and unique passphrase", email: "newcomer@example.org" }).expect(409);
      const other = await signInWith(t, "owner@example.org", "a long and unique passphrase");
      await owner.post("/api/admin/profile/password", { currentPassword: "a long and unique passphrase", newPassword: "short" }).expect(400);
      await owner
        .post("/api/admin/profile/password", { currentPassword: "a long and unique passphrase", newPassword: "Gardens keep 3 quiet rivers" })
        .expect(204);
      await owner.get("/api/admin/auth/session").expect(200);
      await other.get("/api/admin/auth/session").expect(401);
      const [account] = await t.db.select().from(adminUsers).where(eq(adminUsers.email, "owner@example.org"));
      const events = await t.db
        .select()
        .from(auditEvents)
        .where(and(eq(auditEvents.entityId, account!.id), eq(auditEvents.action, "password_changed")));
      expect(events).toHaveLength(1);
      expect(JSON.stringify(events)).not.toMatch(/quiet rivers|scrypt/);
    });

    it('deactivates the own account ("Delete account") with the password, and never the last Rootadmin', async () => {
      const moderator = await signedInAs(t, "moderation", "leaving@example.org");
      await moderator.post("/api/admin/profile/deactivate", { currentPassword: "Another long passphrase 42" }).expect(204);
      await moderator.get("/api/admin/auth/session").expect(401);
      const [left] = await t.db.select().from(adminUsers).where(eq(adminUsers.email, "leaving@example.org"));
      expect(left!.status).toBe("deactivated");
      expect(
        await t.db
          .select()
          .from(adminSessions)
          .where(and(eq(adminSessions.adminUserId, left!.id))),
      ).toSatisfy((rows: { revokedAt: Date | null }[]) => rows.every((row) => row.revokedAt));
    });
  });
});
