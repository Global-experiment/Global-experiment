import { eq } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, TEST_ORIGIN, type TestApp } from "../testing/test-app.js";
import { adminSessions, adminUsers } from "./auth.schema.js";
import { AuthRepository } from "./auth.repository.js";
import { hashPassword } from "./password.js";

const OWNER_EMAIL = "owner@example.org";
const OWNER_PASSWORD = "a long and unique passphrase";

function cookieFrom(res: request.Response): string {
  const header = res.headers["set-cookie"] as unknown as string[] | undefined;
  const cookie = header?.find((value) => value.startsWith("ge_admin_session="));
  if (!cookie) throw new Error("no session cookie set");
  return cookie.split(";")[0]!;
}

let clientCounter = 0;
/** A distinct client IP per login, so the login rate limit only bites in its own test. */
const nextClientIp = () => `203.0.113.${++clientCounter}`;

describe("owner admin authentication", () => {
  let t: TestApp;
  const http = () => request(t.app.getHttpServer());
  const login = (body: object, origin: string | null = TEST_ORIGIN) => {
    const req = http()
      .post("/api/admin/auth/login")
      .set("content-type", "application/json")
      .set("x-forwarded-for", nextClientIp());
    if (origin) req.set("origin", origin);
    return req.send(body);
  };

  beforeAll(async () => {
    // One trusted proxy hop, as in production behind the reverse proxy.
    t = await createTestApp({ TRUST_PROXY_HOPS: "1" });
    await new AuthRepository(t.db).upsertOwner(OWNER_EMAIL, await hashPassword(OWNER_PASSWORD));
  });
  afterAll(async () => {
    await t.close();
  });
  beforeEach(async () => {
    await t.db.delete(adminSessions);
  });

  describe("access boundaries", () => {
    it("refuses admin endpoints without a session", async () => {
      const res = await http().get("/api/admin/auth/session").expect(401);
      expect(res.body.error.code).toBe("unauthenticated");
    });

    it("does not let URL casing route around the admin guard", async () => {
      // Case-sensitive routing: the upper-cased path doesn't reach the admin handler at all.
      const res = await http().get("/API/ADMIN/auth/session");
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("not_found");
    });

    it("leaves public endpoints public", async () => {
      await http().get("/api/health").expect(200);
    });

    it("rejects a forged session cookie", async () => {
      await http().get("/api/admin/auth/session").set("cookie", `ge_admin_session=${"A".repeat(43)}`).expect(401);
      await http().get("/api/admin/auth/session").set("cookie", "ge_admin_session=' OR 1=1 --").expect(401);
    });
  });

  describe("CSRF origin check", () => {
    it("refuses state-changing admin requests without an Origin", async () => {
      const res = await login({ email: OWNER_EMAIL, password: OWNER_PASSWORD }, null).expect(403);
      expect(res.body.error.code).toBe("forbidden");
    });

    it("refuses requests from a non-allow-listed origin", async () => {
      await login({ email: OWNER_EMAIL, password: OWNER_PASSWORD }, "https://evil.example").expect(403);
    });
  });

  describe("login", () => {
    it("rejects an invalid body without echoing it back", async () => {
      const res = await login({ email: "not-an-email", password: "" }).expect(400);
      expect(res.body.error.code).toBe("validation_failed");
      expect(res.body.error.details.issues.map((issue: { path: string }) => issue.path).sort()).toEqual(["email", "password"]);
      expect(JSON.stringify(res.body)).not.toContain("not-an-email");
    });

    it("gives one uniform error for a wrong password and an unknown email", async () => {
      const wrongPassword = await login({ email: OWNER_EMAIL, password: "wrong password entirely" }).expect(401);
      const unknownEmail = await login({ email: "nobody@example.org", password: OWNER_PASSWORD }).expect(401);
      expect(wrongPassword.body.error.message).toBe("Invalid email or password.");
      expect(unknownEmail.body.error.message).toBe(wrongPassword.body.error.message);
      expect(wrongPassword.headers["set-cookie"]).toBeUndefined();
    });

    it("issues an HttpOnly, SameSite=Strict session cookie and stores only its hash", async () => {
      const res = await login({ email: "OWNER@example.org", password: OWNER_PASSWORD }).expect(204);
      const raw = (res.headers["set-cookie"] as unknown as string[])[0]!;
      expect(raw).toMatch(/HttpOnly/i);
      expect(raw).toMatch(/SameSite=Strict/i);
      expect(raw).toMatch(/Path=\//);
      const token = cookieFrom(res).split("=")[1]!;
      const stored = await t.db.select().from(adminSessions);
      expect(stored).toHaveLength(1);
      expect(stored[0]!.tokenHash).not.toBe(token);
      expect(stored[0]!.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    });

    it("authenticates the session and never exposes secrets", async () => {
      const cookie = cookieFrom(await login({ email: OWNER_EMAIL, password: OWNER_PASSWORD }).expect(204));
      const res = await http().get("/api/admin/auth/session").set("cookie", cookie).expect(200);
      expect(res.body).toEqual({ admin: { id: expect.any(String), email: OWNER_EMAIL, role: "owner" } });
      expect(JSON.stringify(res.body)).not.toMatch(/scrypt|password|token/i);
    });
  });

  describe("session lifecycle", () => {
    it("logout revokes the session server-side, so the old cookie stops working", async () => {
      const cookie = cookieFrom(await login({ email: OWNER_EMAIL, password: OWNER_PASSWORD }).expect(204));
      await http().post("/api/admin/auth/logout").set("cookie", cookie).set("origin", TEST_ORIGIN).expect(204);
      await http().get("/api/admin/auth/session").set("cookie", cookie).expect(401);
    });

    it("expires a session after the idle timeout", async () => {
      const cookie = cookieFrom(await login({ email: OWNER_EMAIL, password: OWNER_PASSWORD }).expect(204));
      const longAgo = new Date(Date.now() - (t.config.session.idleMinutes + 1) * 60 * 1000);
      await t.db.update(adminSessions).set({ lastSeenAt: longAgo });
      await http().get("/api/admin/auth/session").set("cookie", cookie).expect(401);
      const [session] = await t.db.select().from(adminSessions);
      expect(session!.revokedAt).not.toBeNull();
    });

    it("re-keying the owner revokes every existing session", async () => {
      const cookie = cookieFrom(await login({ email: OWNER_EMAIL, password: OWNER_PASSWORD }).expect(204));
      await new AuthRepository(t.db).upsertOwner(OWNER_EMAIL, await hashPassword(OWNER_PASSWORD));
      await http().get("/api/admin/auth/session").set("cookie", cookie).expect(401);
    });
  });

  describe("database invariants", () => {
    it("allows exactly one owner", async () => {
      await expect(
        t.db.insert(adminUsers).values({ email: "second@example.org", role: "owner", passwordHash: "x" }),
      ).rejects.toThrow();
    });

    it("treats emails case-insensitively as unique and rejects unknown roles", async () => {
      const [owner] = await t.db.select().from(adminUsers).where(eq(adminUsers.role, "owner"));
      expect(owner).toBeDefined();
      await expect(
        t.db.insert(adminUsers).values({ email: "OWNER@EXAMPLE.ORG", role: "owner", passwordHash: "x" }),
      ).rejects.toThrow();
      await expect(
        t.db.insert(adminUsers).values({ email: "editor@example.org", role: "editor", passwordHash: "x" }),
      ).rejects.toThrow();
    });
  });

  describe("rate limiting", () => {
    it("throttles repeated login attempts from one client", async () => {
      const limited = await createTestApp({ TRUST_PROXY_HOPS: "1" });
      try {
        const attempt = () =>
          request(limited.app.getHttpServer())
            .post("/api/admin/auth/login")
            .set("origin", TEST_ORIGIN)
            .set("x-forwarded-for", "198.51.100.7")
            .send({ email: OWNER_EMAIL, password: "wrong password entirely" });
        for (let i = 0; i < 5; i++) expect((await attempt()).status).toBe(401);
        const blocked = await attempt();
        expect(blocked.status).toBe(429);
        expect(blocked.body.error.code).toBe("rate_limited");
      } finally {
        await limited.close();
      }
    });
  });
});
