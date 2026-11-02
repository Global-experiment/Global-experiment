import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { signedInAdmin, signedInAs, type SignedInAdmin } from "../testing/admin-session.js";
import { createTestApp, TEST_ORIGIN, type TestApp } from "../testing/test-app.js";
import { importRuns } from "./import.schema.js";

/**
 * Imports after OPS-154: CSV is the only import (csv/csv-import.e2e.test.ts).
 * The Notion import routes are gone; past runs (Notion ones included) stay
 * readable. Fixtures in this file only.
 */
describe("admin imports API (CSV only)", () => {
  let t: TestApp;
  let admin: SignedInAdmin;

  beforeAll(async () => {
    t = await createTestApp();
    admin = await signedInAdmin(t);
  });
  afterAll(async () => {
    await t.close();
  });

  it("lists past runs, Notion ones included, newest first (imports.read)", async () => {
    await t.db.insert(importRuns).values([
      { kind: "directory", mode: "dry_run", triggeredBy: "admin:o@example.org", startedAt: new Date("2026-10-20T10:00:00Z"), finishedAt: new Date("2026-10-20T10:00:05Z"), counts: { created: 1 }, issues: [] },
      { kind: "people_csv", mode: "apply", triggeredBy: "admin:o@example.org", startedAt: new Date("2026-10-30T10:00:00Z"), finishedAt: new Date("2026-10-30T10:00:02Z"), counts: { fileName: "people.csv", create: 2 }, issues: [] },
    ]);
    const runs = (await admin.get("/api/admin/imports/runs").expect(200)).body;
    expect(runs.items.map((run: { kind: string }) => run.kind)).toEqual(["people_csv", "directory"]);
    expect(runs.total).toBe(2);
    expect((await (await signedInAs(t, "moderation")).get("/api/admin/imports/runs")).status).toBe(403);
    expect((await request(t.app.getHttpServer()).get("/api/admin/imports/runs").set("origin", TEST_ORIGIN)).status).toBe(401);
  });

  it("has no Notion import any more: its routes are gone", async () => {
    for (const path of ["/api/admin/imports/directory/dry-run", "/api/admin/imports/directory/apply", "/api/admin/imports/treasury/dry-run"]) {
      expect((await admin.post(path, {})).status).toBe(404);
    }
    expect((await admin.get("/api/admin/imports/status")).status).toBe(404);
  });
});
