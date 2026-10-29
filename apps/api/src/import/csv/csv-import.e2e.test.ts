import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { auditEvents } from "../../audit/audit.schema.js";
import { organizations } from "../../organizations/organizations.schema.js";
import { PeopleRepository } from "../../people/people.repository.js";
import { people } from "../../people/people.schema.js";
import { signedInAdmin, signedInAs, type SignedInAdmin } from "../../testing/admin-session.js";
import { createTestApp, type TestApp } from "../../testing/test-app.js";
import { importRuns } from "../import.schema.js";

/**
 * The CSV import of People and Organizations through the API: preview
 * (nothing written), confirm (one transaction, matching the preview), the
 * history of each created record, the import_runs record and its report;
 * who may import; and no import or export for any other table.
 */
describe("CSV import API", () => {
  let t: TestApp;
  let owner: SignedInAdmin;
  let writer: SignedInAdmin;
  let reader: SignedInAdmin;
  beforeAll(async () => {
    t = await createTestApp({ TRUST_PROXY_HOPS: "1" });
    owner = await signedInAdmin(t);
    // Operation admin: directory.create (writes People and Organizations); Moderator: directory.read only.
    writer = await signedInAs(t, "operations");
    reader = await signedInAs(t, "moderation");
    await owner.post("/api/admin/organizations", { name: "Civic Lab" }).expect(201);
    await owner.post("/api/admin/people", { name: "Ada Existing", email: "ada@example.net" }).expect(201);
  });
  afterAll(async () => {
    await t.close();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Test fixtures only.
  const csv = (text: string) => Buffer.from(text, "utf8");
  const PEOPLE = csv(
    "Name;Email;Organizations;State;Person ID\n" + // semicolons, as European spreadsheets write them
      "Bea New;bea@example.net;Civic Lab;Sourced;PER-1\n" +
      "Ada Existing;;;;PER-2\n" +
      "Cid New;not-an-email;;;PER-3\n" +
      "Dee New;;;;\n",
  );
  const send = (agent: SignedInAdmin, step: "preview" | "confirm", file: Buffer | null, options: object = {}, table = "people") =>
    agent.form(`/api/admin/imports/csv/${table}/${step}`, { options: JSON.stringify({ fileName: "contacts.csv", ...options }) }, file ? { field: "file", bytes: file, fileName: "contacts.csv" } : undefined);

  it("previews: columns matched, every row checked, duplicates flagged — and nothing written", async () => {
    const before = await t.db.$count(people);
    const preview = (await send(writer, "preview", PEOPLE).expect(201)).body;
    expect(preview).toMatchObject({ fileName: "contacts.csv", delimiter: ";", headers: ["Name", "Email", "Organizations", "State", "Person ID"], mapping: ["name", "email", "organizations", "state", null] });
    expect(preview.counts).toEqual({ fileName: "contacts.csv", rows: 4, create: 2, duplicates: 1, duplicatesIncluded: 0, errors: 1 });
    expect(preview.rows.map((row: { line: number; status: string; errors: string[]; duplicate: { reason: string } | null }) => [row.line, row.status, row.errors, row.duplicate?.reason ?? null])).toEqual([
      [2, "create", [], null],
      [3, "duplicate", [], "Same name as Ada Existing"],
      [4, "error", ["Email: Invalid email address."], null],
      [5, "create", [], null],
    ]);
    expect(preview.samples[0]).toEqual(["Bea New", "Ada Existing", "Cid New"]);
    expect(await t.db.$count(people)).toBe(before);
    expect(await t.db.$count(importRuns)).toBe(0);
  });

  it("explains a file it can't read or column choices that can't work (400, nothing written)", async () => {
    const bad = await send(writer, "preview", Buffer.from([0x4e, 0x61, 0x6d, 0x65, 0x0a, 0xe9])).expect(400);
    expect(bad.body.error.details.issues).toEqual([{ path: "file", message: 'The file isn\'t UTF-8 text. Export it again as "CSV UTF-8".' }]);
    await send(writer, "preview", null).expect(400);
    const mapping = await send(writer, "preview", PEOPLE, { mapping: [null, "email", null, null, null] }).expect(400);
    expect(mapping.body.error.details.issues[0].message).toBe("Choose the column that holds the Name: every record needs one.");
  });

  it("only the table's writers import; readers can't (403), and the API says so whatever the page shows", async () => {
    await send(reader, "preview", PEOPLE).expect(403);
    await send(reader, "confirm", PEOPLE, { mapping: [], expect: {} }).expect(403);
    await send(reader, "preview", csv("Name\nAcme\n"), {}, "organizations").expect(403);
  });

  it("imports in one go: the rows the preview showed, a history event per record naming the admin, and the run", async () => {
    const preview = (await send(writer, "preview", PEOPLE).expect(201)).body;
    const done = (await send(writer, "confirm", PEOPLE, { mapping: preview.mapping, expect: preview.counts }).expect(201)).body;
    expect(done.counts).toEqual(preview.counts);

    const bea = (await owner.get("/api/admin/people?search=Bea%20New").expect(200)).body.items[0];
    expect(bea).toMatchObject({ name: "Bea New", email: "bea@example.net", state: { key: "sourced" }, organizations: [{ name: "Civic Lab" }] });
    expect((await owner.get("/api/admin/people?search=Dee%20New").expect(200)).body.total).toBe(1);
    // Never imported: the duplicate (skipped by default) and the row with an error. The existing record is untouched.
    expect((await owner.get("/api/admin/people?search=Cid").expect(200)).body.total).toBe(0);
    expect((await owner.get("/api/admin/people?search=Ada%20Existing").expect(200)).body.items).toMatchObject([{ email: "ada@example.net" }]);

    const history = (await owner.get(`/api/admin/history/person/${bea.id}`).expect(200)).body.items;
    expect(history[0]).toMatchObject({ action: "imported", actor: { type: "admin", label: expect.stringContaining("operations") }, meta: { importSource: "CSV import", fileName: "contacts.csv" } });

    const [run] = await t.db.select().from(importRuns).where(eq(importRuns.id, done.runId));
    expect(run).toMatchObject({ kind: "people_csv", mode: "apply", triggeredBy: "admin:operations@example.org", counts: { fileName: "contacts.csv", create: 2 } });
    const [runEvent] = await t.db.select().from(auditEvents).where(eq(auditEvents.entityId, done.runId));
    expect(runEvent).toMatchObject({ entityType: "import_run", actorType: "admin", meta: expect.objectContaining({ label: "CSV import of People · contacts.csv" }) });

    // The report (OPS-150): every row, created records and the existing duplicate linked.
    const report = (await reader.get(`/api/admin/imports/csv/runs/${done.runId}`).expect(200)).body;
    expect(report).toMatchObject({ table: "people", mode: "apply", triggeredBy: "operations@example.org", counts: { create: 2, duplicates: 1, errors: 1 } });
    expect(report.rows.map((row: { line: number; status: string; recordId: string | null; duplicate: { existing: { name: string } | null } | null }) => [row.line, row.status, row.recordId !== null, row.duplicate?.existing?.name ?? null])).toEqual([
      [2, "created", true, null],
      [3, "duplicate", false, "Ada Existing"],
      [4, "error", false, null],
      [5, "created", true, null],
    ]);
  });

  it("imports a flagged duplicate only when included — as a new record, the existing one untouched", async () => {
    const file = csv("Name,Email\nAda Existing,ada.second@example.net\n");
    const preview = (await send(writer, "preview", file, { include: [2] }).expect(201)).body;
    expect(preview.rows[0]).toMatchObject({ status: "create", included: true, duplicate: { reason: "Same name as Ada Existing" } });
    await send(writer, "confirm", file, { mapping: preview.mapping, include: [2], expect: preview.counts }).expect(201);
    const both = (await owner.get("/api/admin/people?search=Ada%20Existing").expect(200)).body.items.map((person: { email: string }) => person.email).sort();
    expect(both).toEqual(["ada.second@example.net", "ada@example.net"]);
  });

  it("refuses to import when the records changed since the preview: nothing written, the refusal recorded", async () => {
    const file = csv("Name,Email\nEli Late,eli@example.net\n");
    const preview = (await send(writer, "preview", file).expect(201)).body;
    await owner.post("/api/admin/people", { name: "Eli Late", email: "eli@example.net" }).expect(201); // someone adds him meanwhile
    const refused = await send(writer, "confirm", file, { mapping: preview.mapping, expect: preview.counts }).expect(409);
    expect(refused.body.error.message).toBe("The records changed since the preview (one was added or edited): check the preview again before importing.");
    expect((await owner.get("/api/admin/people?search=Eli%20Late").expect(200)).body.total).toBe(1);
    const [failed] = await t.db.select().from(importRuns).where(eq(importRuns.mode, "failed"));
    expect(failed).toMatchObject({ kind: "people_csv" });
  });

  it("is all or nothing: a failure while writing leaves no record behind", async () => {
    const file = csv("Name\nFio One\nFio Two\nFio Three\n");
    const preview = (await send(writer, "preview", file).expect(201)).body;
    const create = PeopleRepository.prototype.create;
    let calls = 0;
    vi.spyOn(PeopleRepository.prototype, "create").mockImplementation(function (this: PeopleRepository, ...args) {
      if (++calls === 2) throw new Error("disk full");
      return create.apply(this, args);
    });
    await send(writer, "confirm", file, { mapping: preview.mapping, expect: preview.counts }).expect(500);
    expect((await owner.get("/api/admin/people?search=Fio").expect(200)).body.total).toBe(0);
    const failed = await t.db.select().from(importRuns).where(eq(importRuns.mode, "failed"));
    const report = (await owner.get(`/api/admin/imports/csv/runs/${failed.at(-1)!.id}`).expect(200)).body;
    expect(report.failure).toBe("Rolled back, nothing written: disk full");
    expect(report.rows.map((row: { status: string }) => row.status)).toEqual(["not_imported", "not_imported", "not_imported"]);
  });

  it("imports organizations the same way", async () => {
    const file = csv("Name,Website\nGreen Commons,green.test\nCivic Lab,\n");
    const preview = (await send(writer, "preview", file, {}, "organizations").expect(201)).body;
    expect(preview.counts).toMatchObject({ create: 1, duplicates: 1 });
    const done = (await send(writer, "confirm", file, { mapping: preview.mapping, expect: preview.counts }, "organizations").expect(201)).body;
    expect(await t.db.$count(organizations, eq(organizations.name, "Green Commons"))).toBe(1);
    expect((await owner.get(`/api/admin/imports/csv/runs/${done.runId}`).expect(200)).body.table).toBe("organizations");
  });

  it("has no import or export for Treasury or any other table — refused for every role, Rootadmin included", async () => {
    const message = "Only People and Organizations can be imported. Treasury and every other table are edited in the admin.";
    for (const table of ["treasury", "expertise", "services", "access-grants", "accounts"]) {
      expect((await send(owner, "preview", PEOPLE, {}, table).expect(403)).body.error.message, table).toBe(message);
      await send(owner, "confirm", PEOPLE, {}, table).expect(403);
    }
    for (const kind of ["treasury", "taxonomy"]) expect((await owner.post(`/api/admin/imports/${kind}/dry-run`).expect(403)).body.error.message).toBe(message);
    // No export route exists anywhere.
    for (const path of ["/api/admin/treasury/export", "/api/admin/treasury/export.csv", "/api/admin/people/export", "/api/admin/organizations/export", "/api/admin/exports/treasury"]) {
      const status = (await owner.get(path)).status;
      expect([400, 404], path).toContain(status);
    }
  });
});
