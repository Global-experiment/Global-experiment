import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { expertiseDomains, expertiseFields, expertiseItems, expertiseTeams } from "../expertise/expertise.schema.js";
import { signedInAdmin, type SignedInAdmin } from "../testing/admin-session.js";
import { createTestApp, type TestApp } from "../testing/test-app.js";
import type { DirectorySource } from "./directory/directory-source.js";
import { IMPORT_SOURCE, type ImportKind, type ImportSource } from "./import-source.js";
import { importRuns } from "./import.schema.js";
import type { SourceRow, TaxonomySource } from "./taxonomy/taxonomy-source.js";
import type { SourceTreasuryEntry, TreasurySource } from "./treasury/treasury-source.js";

// Test fixtures only — no Notion call: the import source is replaced.
const row = (level: SourceRow["level"], pageId: string, name: string, rawStableId: string, parent?: string): SourceRow => ({
  level,
  pageId,
  createdTime: "2026-10-14T10:00:00.000Z",
  name,
  rawStableId,
  status: "Active",
  parentPageIds: parent ? [parent] : [],
  teams: [],
});
const page = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, "0")}`;
const taxonomy = (extraItem = false): TaxonomySource => ({
  domains: [row("domain", page(1), "Government", "domain.07.government")],
  fields: [row("field", page(2), "Participation", "field.07.02.participation", page(1))],
  expertise: [
    row("expertise", page(3), "Citizen assemblies", "07.02.citizen_assemblies", page(2)),
    ...(extraItem ? [row("expertise", page(4), "Petitions", "07.02.petitions", page(2))] : []),
  ],
});

class FakeSource implements ImportSource {
  configured = true;
  data = taxonomy();
  /** When set, reading waits for it (to keep a job running). */
  gate: Promise<void> | null = null;
  unavailable(kind: ImportKind) {
    return this.configured ? undefined : `Notion import isn't configured on the server (${kind}).`;
  }
  async taxonomy() {
    if (this.gate) await this.gate;
    return structuredClone(this.data);
  }
  treasuryRows: SourceTreasuryEntry[] = [];
  async treasury(): Promise<TreasurySource> {
    return { entries: structuredClone(this.treasuryRows), layout: { names: {}, unread: [], absent: [] } };
  }
  async directory(): Promise<DirectorySource> {
    return { organizations: [], people: [], layouts: { people: { names: {}, required: [], unread: [], absent: [] }, organizations: { names: {}, required: [], unread: [], absent: [] } } };
  }
}

describe("admin import API", () => {
  let t: TestApp;
  let admin: SignedInAdmin;
  const source = new FakeSource();

  beforeAll(async () => {
    t = await createTestApp({}, [{ provide: IMPORT_SOURCE, useValue: source }]);
    admin = await signedInAdmin(t);
  });
  afterAll(async () => {
    await t.close();
  });
  beforeEach(async () => {
    source.configured = true;
    source.data = taxonomy();
    source.gate = null;
    await t.db.delete(importRuns);
    await t.db.delete(expertiseTeams);
    await t.db.delete(expertiseItems);
    await t.db.delete(expertiseFields);
    await t.db.delete(expertiseDomains);
  });

  /** Polls the job like the page does. */
  async function finished(jobId: string) {
    for (let attempt = 0; attempt < 500; attempt++) {
      const job = (await admin.get(`/api/admin/imports/jobs/${jobId}`).expect(200)).body;
      if (job.status !== "running") return job;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error("job didn't finish");
  }
  const dryRun = async (kind = "taxonomy") => finished((await admin.post(`/api/admin/imports/${kind}/dry-run`).expect(202)).body.id);

  it("every endpoint needs a session", async () => {
    const anonymous = () => request(t.app.getHttpServer());
    await anonymous().get("/api/admin/imports/status").expect(401);
    await anonymous().get("/api/admin/imports/runs").expect(401);
    await anonymous().post("/api/admin/imports/taxonomy/dry-run").set("origin", "http://localhost:3000").expect(401);
    await anonymous().post("/api/admin/imports/taxonomy/apply").set("origin", "http://localhost:3000").send({ dryRunId: page(9) }).expect(401);
  });

  it("says when Notion isn't configured, and refuses to start", async () => {
    source.configured = false;
    const status = (await admin.get("/api/admin/imports/status").expect(200)).body;
    expect(status.taxonomy).toEqual({ available: false, reason: "Notion import isn't configured on the server (taxonomy)." });
    await admin.post("/api/admin/imports/taxonomy/dry-run").expect(409);
    await admin.post("/api/admin/imports/unknown/dry-run").expect(400);
  });

  it("runs a dry run in the background, records it, and writes nothing else", async () => {
    const started = await admin.post("/api/admin/imports/taxonomy/dry-run").expect(202);
    expect(started.body).toMatchObject({ kind: "taxonomy", mode: "dry_run", status: "running", triggeredBy: "admin:owner@example.org" });
    const job = await finished(started.body.id);
    expect(job).toMatchObject({ status: "succeeded", phase: "done", changes: 3, runId: expect.any(String) });
    expect(job.report).toContain("TAXONOMY IMPORT — DRY RUN");
    expect(await t.db.$count(expertiseItems)).toBe(0);

    const runs = (await admin.get("/api/admin/imports/runs").expect(200)).body;
    expect(runs.total).toBe(1);
    expect(runs.items[0]).toMatchObject({ id: job.runId, kind: "taxonomy", mode: "dry_run", triggeredBy: "admin:owner@example.org" });
    expect(runs.items[0].counts.changes).toBe(3);
  });

  it("apply needs the latest dry run of that kind", async () => {
    const missing = await admin.post("/api/admin/imports/taxonomy/apply", {}).expect(400);
    expect(missing.body.error.details.issues[0].path).toBe("dryRunId");
    await admin.post("/api/admin/imports/taxonomy/apply", { dryRunId: page(9) }).expect(400);

    const first = await dryRun();
    const second = await dryRun();
    // The first dry run is no longer the latest.
    await admin.post("/api/admin/imports/taxonomy/apply", { dryRunId: first.runId }).expect(400);
    // A directory dry run can't stand in for a taxonomy one.
    const directory = await dryRun("directory");
    await admin.post("/api/admin/imports/taxonomy/apply", { dryRunId: directory.runId }).expect(400);

    const applied = await finished((await admin.post("/api/admin/imports/taxonomy/apply", { dryRunId: second.runId }).expect(202)).body.id);
    expect(applied).toMatchObject({ mode: "apply", status: "succeeded", dryRunId: second.runId, changes: 3 });
    expect(applied.report).toContain("TAXONOMY IMPORT — APPLIED");
    expect(await t.db.$count(expertiseItems)).toBe(1);
    // Applied: the dry run can't be applied twice.
    await admin.post("/api/admin/imports/taxonomy/apply", { dryRunId: second.runId }).expect(400);
  });

  it("refuses to apply when Notion changed since the dry run (nothing written)", async () => {
    const reviewed = await dryRun();
    source.data = taxonomy(true); // a new item appeared in Notion
    const applied = await finished((await admin.post("/api/admin/imports/taxonomy/apply", { dryRunId: reviewed.runId }).expect(202)).body.id);
    expect(applied).toMatchObject({ status: "refused", error: "Notion or the database changed since the dry run: run a new dry run and review it before applying." });
    expect(await t.db.$count(expertiseItems)).toBe(0);
  });

  it("runs one import at a time", async () => {
    let release!: () => void;
    source.gate = new Promise((resolve) => (release = resolve));
    const running = await admin.post("/api/admin/imports/taxonomy/dry-run").expect(202);
    expect((await admin.get("/api/admin/imports/status").expect(200)).body.activeJob).toMatchObject({ id: running.body.id, status: "running" });
    const busy = await admin.post("/api/admin/imports/directory/dry-run").expect(409);
    expect(busy.body.error.message).toBe("Another import is running: wait for it to finish.");
    release();
    await finished(running.body.id);
    expect((await admin.get("/api/admin/imports/status").expect(200)).body.activeJob).toBeNull();
  });
});
