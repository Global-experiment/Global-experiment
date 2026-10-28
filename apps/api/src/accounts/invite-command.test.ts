import { eq } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminUsers } from "../auth/auth.schema.js";
import { signedInAdmin, type SignedInAdmin } from "../testing/admin-session.js";
import { createTestApp, TEST_ORIGIN, type TestApp } from "../testing/test-app.js";
import { inviteByCommand } from "./invite-command.js";

/** `admin:invite` (the deploy runbook): the same invitation as "New account", made from the server. */
describe("admin:invite command", () => {
  let t: TestApp;
  let owner: SignedInAdmin;
  beforeAll(async () => {
    t = await createTestApp({ TRUST_PROXY_HOPS: "1" });
    owner = await signedInAdmin(t);
  });
  afterAll(async () => {
    await t.close();
  });

  const inspect = (token: string) => request(t.app.getHttpServer()).post("/api/admin/auth/tokens/inspect").set("origin", TEST_ORIGIN).send({ token });
  const tokenOf = (link: string) => link.split("#")[1]!;

  it("invites: an invited account with the role, a 72-hour link to /admin/welcome, and the event in its history", async () => {
    const now = new Date();
    const result = await inviteByCommand(t.db, { email: "Invitee@Example.org", role: "owner", displayName: "Invitee" }, "https://globalexperiment.org", now);
    expect(result.outcome).toBe("invited");
    expect(result.link).toMatch(/^https:\/\/globalexperiment\.org\/admin\/welcome#[A-Za-z0-9_-]{43}$/);
    expect(new Date(result.expiresAt).getTime() - now.getTime()).toBe(72 * 3_600_000);
    const [account] = await t.db.select().from(adminUsers).where(eq(adminUsers.email, "Invitee@Example.org"));
    expect(account).toMatchObject({ role: "owner", status: "invited", passwordHash: null, displayName: "Invitee" });
    expect((await inspect(tokenOf(result.link)).expect(200)).body).toMatchObject({ purpose: "invite", email: "Invitee@Example.org", name: "Invitee" });
    const history = (await owner.get(`/api/admin/history/admin_user/${account!.id}`).expect(200)).body.items;
    expect(history[0]).toMatchObject({ action: "invited", actor: { type: "automation" }, meta: { role: "Rootadmin", origin: "admin:invite" } });
  });

  it("gives a still-invited account a new link (the old one stops working), and leaves an active one alone", async () => {
    const first = await inviteByCommand(t.db, { email: "again@example.org", role: "tech" }, "https://globalexperiment.org");
    const second = await inviteByCommand(t.db, { email: "AGAIN@example.org", role: "tech" }, "https://globalexperiment.org");
    expect(second.outcome).toBe("new_link");
    await inspect(tokenOf(first.link)).expect(404);
    await inspect(tokenOf(second.link)).expect(200);
    await expect(inviteByCommand(t.db, { email: "owner@example.org", role: "owner" }, "https://globalexperiment.org")).rejects.toThrow(/already active/);
    await expect(inviteByCommand(t.db, { email: "x@example.org", role: "superadmin" }, "https://globalexperiment.org")).rejects.toThrow(/Unknown role/);
  });
});
