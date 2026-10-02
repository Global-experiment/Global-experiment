import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "../testing/test-app.js";

describe("platform foundation (HTTP)", () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  it("GET /api/health reports the database as ok, uncached", async () => {
    const res = await request(t.app.getHttpServer()).get("/api/health").expect(200);
    expect(res.body).toMatchObject({ status: "ok", checks: { database: "ok" } });
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("assigns a request id, and reuses a well-formed incoming one", async () => {
    const fresh = await request(t.app.getHttpServer()).get("/api/health");
    expect(fresh.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);

    const reused = await request(t.app.getHttpServer()).get("/api/health").set("x-request-id", "proxy-req-12345");
    expect(reused.headers["x-request-id"]).toBe("proxy-req-12345");

    const rejected = await request(t.app.getHttpServer()).get("/api/health").set("x-request-id", "<script>");
    expect(rejected.headers["x-request-id"]).not.toBe("<script>");
  });

  it("returns the uniform JSON error shape for unknown routes, with no framework text", async () => {
    const res = await request(t.app.getHttpServer()).get("/api/does-not-exist").set("x-request-id", "trace-abcdef12");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: "not_found", message: "Not found.", requestId: "trace-abcdef12" } });
    expect(JSON.stringify(res.body)).not.toMatch(/Cannot GET|stack|at .*\.js/);
  });

  it("sends hardened headers and hides the framework", async () => {
    const res = await request(t.app.getHttpServer()).get("/api/health");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["content-security-policy"]).toContain("default-src 'none'");
    expect(res.headers["x-frame-options"]).toBeDefined();
    expect(res.headers["x-powered-by"]).toBeUndefined();
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("rejects oversized JSON bodies with 413 in the uniform shape", async () => {
    const res = await request(t.app.getHttpServer())
      .post("/api/admin/auth/login")
      .set("origin", "http://localhost:3000")
      .set("content-type", "application/json")
      .send(JSON.stringify({ email: "a@b.co", password: "x".repeat(200 * 1024) }));
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe("payload_too_large");
  });

  it("rejects malformed JSON with 400 in the uniform shape", async () => {
    const res = await request(t.app.getHttpServer())
      .post("/api/admin/auth/login")
      .set("origin", "http://localhost:3000")
      .set("content-type", "application/json")
      .send("{not json");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("validation_failed");
  });
});
