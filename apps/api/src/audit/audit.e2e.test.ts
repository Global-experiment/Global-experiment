import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CLOCK } from "../common/clock/clock.js";
import { treasuryEntries } from "../treasury/treasury.schema.js";
import { signedInAdmin, type SignedInAdmin } from "../testing/admin-session.js";
import { createTestApp, type TestApp } from "../testing/test-app.js";
import { auditEvents, recordComments } from "./audit.schema.js";
import { canRead, maskText, visibleChanges } from "./record-fields.js";
import type { AuditChange } from "./audit.types.js";

/**
 * The platform's history (migrations 0009–0010, decisions 10–12): every
 * write audited with one event per Submit, the record feed with its
 * counters, views once per account per window, comments their authors
 * edit or delete, archive/restore/permanent delete, privacy, and the
 * Monitoring → History list.
 */
describe("record history (audit log)", () => {
  let t: TestApp;
  let admin: SignedInAdmin;
  let now = new Date("2026-10-16T14:00:00Z");

  beforeAll(async () => {
    t = await createTestApp({ TRUST_PROXY_HOPS: "1" }, [{ provide: CLOCK, useValue: () => now }]);
    admin = await signedInAdmin(t);
  });
  afterAll(async () => {
    await t.close();
  });

  const feed = async (type: string, id: string) => (await admin.get(`/api/admin/history/${type}/${id}`).expect(200)).body;
  const createPerson = async (body: object) => (await admin.post("/api/admin/people", body).expect(201)).body;
  type Item = { action: string; actor: { label: string; type: string }; changes: (AuditChange & { masked?: true; redacted?: true })[]; meta: Record<string, unknown>; comment?: { id: string; body: string; current: string; mine: boolean; deleted: boolean } };

  it("records 'created' with the actor and the record's label; one event per Submit with every changed field", async () => {
    const organization = (await admin.post("/api/admin/organizations", { name: "Civic Lab" }).expect(201)).body;
    const person = await createPerson({ name: "Stanley Q.", website: "https://stanley.example", personalNote: "Contact through email", email: "stanley@example.org" });

    let history = await feed("person", person.id);
    expect(history.items).toHaveLength(1);
    expect(history.items[0]).toMatchObject({ action: "created", actor: { type: "admin", label: "owner" }, meta: { label: `PER-${person.personNumber} · Stanley Q.`, collection: "People" } });
    expect(history.createdBy).toMatchObject({ label: "owner" });

    now = new Date("2026-10-16T16:45:00Z");
    await admin
      .patch(`/api/admin/people/${person.id}`, {
        name: "Stanley Qiang",
        website: "https://workana.com",
        personalNote: "Contact through Workana",
        email: "stanley@example.net",
        stateKey: "contacted",
        organizationIds: [organization.id],
        relevanceScore: 8,
      })
      .expect(200);
    history = await feed("person", person.id);
    expect(history.items).toHaveLength(2);
    expect(history.edits).toBe(1);
    expect(history.total).toBe(2);
    const updated = history.items[0] as Item;
    expect(updated.action).toBe("updated");
    const byField = Object.fromEntries(updated.changes.map((change) => [change.field, change]));
    expect(Object.keys(byField).sort()).toEqual(["email", "name", "organizations", "personalNote", "relevanceScore", "state", "website"]);
    expect(byField.name).toMatchObject({ kind: "text", before: "Stanley Q.", after: "Stanley Qiang" });
    expect(byField.website).toMatchObject({ kind: "url", before: "https://stanley.example", after: "https://workana.com" });
    expect(byField.state).toMatchObject({ kind: "select", before: null, after: { key: "contacted", label: "Contacted" } });
    expect(byField.organizations).toMatchObject({ kind: "relation", before: [], after: [{ id: organization.id, label: "Civic Lab" }] });
    expect(byField.relevanceScore).toMatchObject({ kind: "number", before: null, after: 8 });
    // Contact details are masked in the history (the record itself shows them).
    expect(byField.email).toMatchObject({ before: "s•••@example.org", after: "s•••@example.net", masked: true });
    // The private note's text is never returned in the history.
    expect(byField.personalNote).toEqual({ field: "personalNote", label: "Personal note", kind: "text", privacy: "private_note", before: null, after: null, redacted: true });
    // …but it is in the log, for authorized viewers later.
    const [stored] = await t.db.select().from(auditEvents).where(eq(auditEvents.entityId, person.id)).orderBy(auditEvents.id).limit(2).offset(1);
    expect(stored!.changes.find((change) => change.field === "personalNote")).toMatchObject({ before: "Contact through email", after: "Contact through Workana" });
    expect(history.lastEditedBy).toMatchObject({ label: "owner", at: "2026-10-16T16:45:00.000Z" });
    // The organization linked by this Submit got its own event (both records show the link).
    const organizationHistory = await feed("organization", organization.id);
    expect(organizationHistory.items.map((item: Item) => item.action)).toEqual(["updated", "created"]);
    expect((organizationHistory.items[0] as Item).changes).toMatchObject([{ field: "people", after: [{ label: "Stanley Qiang" }] }]);

    // Saving the same values again records nothing, on either record.
    await admin.patch(`/api/admin/people/${person.id}`, { name: "Stanley Qiang", organizationIds: [organization.id] }).expect(200);
    expect((await feed("person", person.id)).items).toHaveLength(2);
    expect((await feed("organization", organization.id)).items).toHaveLength(2);
  });

  it("records added and cleared fields, links and unlinks, and the linked side's own event", async () => {
    const person = await createPerson({ name: "Ada", otherSocials: "https://previous.example" });
    const organization = (await admin.post("/api/admin/organizations", { name: "Harbor Collective" }).expect(201)).body;
    await admin.patch(`/api/admin/people/${person.id}`, { otherSocials: null, website: "https://ada.example" }).expect(200);
    await admin.put(`/api/admin/organizations/${organization.id}/people/${person.id}`).expect(204);
    await admin.delete(`/api/admin/people/${person.id}/organizations/${organization.id}`).expect(204);
    const items = (await feed("person", person.id)).items as Item[];
    expect(items.map((item) => item.action)).toEqual(["updated", "updated", "updated", "created"]);
    expect(items[0]!.changes).toEqual([{ field: "organizations", label: "Organizations", kind: "relation", before: [{ id: organization.id, label: "Harbor Collective" }], after: [] }]);
    expect(items[1]!.changes).toEqual([{ field: "organizations", label: "Organizations", kind: "relation", before: [], after: [{ id: organization.id, label: "Harbor Collective" }] }]);
    expect(items[2]!.changes.map((change) => [change.field, change.before, change.after])).toEqual([
      ["website", null, "https://ada.example"],
      ["otherSocials", "https://previous.example", null],
    ]);
    const organizationItems = (await feed("organization", organization.id)).items as Item[];
    expect(organizationItems.map((item) => item.changes.map((change) => change.field))).toEqual([["people"], ["people"], []]);
  });

  it("records a duplicate on the copy ('Duplicated from PER-n')", async () => {
    const original = await createPerson({ name: "Original" });
    const copy = (await admin.post(`/api/admin/people/${original.id}/duplicate`).expect(201)).body;
    const [item] = (await feed("person", copy.id)).items as Item[];
    expect(item).toMatchObject({ action: "duplicated", meta: { duplicatedFrom: { id: original.id, label: `PER-${original.personNumber}` } } });
    expect((await feed("person", original.id)).items).toHaveLength(1);
  });

  it("archives (out of the default list, into Archived) and restores, both in the history", async () => {
    const person = await createPerson({ name: "Archived Person" });
    const listed = async (query = "") => ((await admin.get(`/api/admin/people?pageSize=100${query}`).expect(200)).body.items as { id: string }[]).some((item) => item.id === person.id);
    expect(await listed()).toBe(true);
    const archived = (await admin.post(`/api/admin/people/${person.id}/archive`).expect(200)).body;
    expect(archived.archivedAt).not.toBeNull();
    expect(await listed()).toBe(false);
    expect(await listed("&filter=archived:is:true")).toBe(true);
    await admin.post(`/api/admin/people/${person.id}/restore`).expect(200);
    expect(await listed()).toBe(true);
    expect(((await feed("person", person.id)).items as Item[]).map((item) => item.action)).toEqual(["restored", "archived", "created"]);
    // Archiving twice is a no-op, not a second event.
    await admin.post(`/api/admin/people/${person.id}/restore`).expect(200);
    expect((await feed("person", person.id)).items).toHaveLength(3);
  });

  it("permanently deletes only with the name typed exactly; the event stays in the log", async () => {
    const person = await createPerson({ name: "To Delete" });
    const wrong = await admin.delete(`/api/admin/people/${person.id}`).send({ confirm: "to delete" }).expect(400);
    expect(wrong.body.error.details.issues[0]).toMatchObject({ path: "confirm" });
    await admin.delete(`/api/admin/people/${person.id}`).send({ confirm: "To Delete" }).expect(204);
    await admin.get(`/api/admin/people/${person.id}`).expect(404);
    const events = await t.db.select().from(auditEvents).where(eq(auditEvents.entityId, person.id));
    expect(events.map((event) => event.action)).toEqual(["created", "deleted"]);
    expect(events[1]!.meta).toMatchObject({ label: `PER-${person.personNumber} · To Delete` });
  });

  it("refuses to delete a person who is the recipient of an expense (archive instead)", async () => {
    const person = await createPerson({ name: "Recipient" });
    await t.db.insert(treasuryEntries).values({ entryType: "expense", name: "Hosting", currency: "USD", grossAmount: -2000, source: "manual", managedBy: "native", livemode: true, occurredOn: "2026-10-01", recipientPersonId: person.id });
    const refused = await admin.delete(`/api/admin/people/${person.id}`).send({ confirm: "Recipient" }).expect(409);
    expect(refused.body.error.message).toMatch(/recipient of expenses/);
  });

  it("links an expense to a person: both the person and the expense record it", async () => {
    const person = await createPerson({ name: "Contractor" });
    const [expense] = await t.db
      .insert(treasuryEntries)
      .values({ entryType: "expense", name: "Development", currency: "USD", grossAmount: -20000, source: "manual", managedBy: "native", livemode: true, occurredOn: "2026-10-01" })
      .returning();
    const updated = (await admin.patch(`/api/admin/people/${person.id}`, { expenseIds: [expense!.id] }).expect(200)).body;
    expect(updated.expenses).toEqual([{ id: expense!.id, entryNumber: expense!.entryNumber, currency: "USD", grossAmount: -20000 }]);
    const [personEvent] = (await feed("person", person.id)).items as Item[];
    expect(personEvent!.changes).toEqual([
      { field: "expenses", label: "Expenses", kind: "relation", before: [], after: [{ id: expense!.id, label: `EXP-${expense!.entryNumber} · −USD 200.00` }] },
    ]);
    const [entryEvent] = (await feed("treasury_entry", expense!.id)).items as Item[];
    expect(entryEvent).toMatchObject({ action: "updated", changes: [{ field: "recipient", after: [{ id: person.id }] }] });
    // An expense that already has a recipient can't be linked to someone else.
    const other = await createPerson({ name: "Other" });
    const refused = await admin.patch(`/api/admin/people/${other.id}`, { expenseIds: [expense!.id] }).expect(400);
    expect(refused.body.error.details.issues[0]).toMatchObject({ path: "expenseIds", message: "This expense already has a recipient." });
  });

  it("counts every opening; shows 'viewed' once per account per 24 hours", async () => {
    const person = await createPerson({ name: "Viewed" });
    now = new Date("2026-10-17T11:04:00Z");
    expect((await admin.post(`/api/admin/history/person/${person.id}/views`).expect(201)).body).toEqual({ views: 1 });
    now = new Date("2026-10-17T15:00:00Z");
    expect((await admin.post(`/api/admin/history/person/${person.id}/views`).expect(201)).body).toEqual({ views: 2 });
    let history = await feed("person", person.id);
    expect(history.views).toBe(2);
    expect((history.items as Item[]).map((item) => item.action)).toEqual(["viewed", "created"]);
    now = new Date("2026-10-18T11:05:00Z");
    await admin.post(`/api/admin/history/person/${person.id}/views`).expect(201);
    history = await feed("person", person.id);
    expect(history.views).toBe(3);
    expect((history.items as Item[]).map((item) => item.action)).toEqual(["viewed", "viewed", "created"]);
    expect(history.total).toBe(3);
    await admin.post(`/api/admin/history/person/00000000-0000-4000-8000-000000000000/views`).expect(404);
    await admin.post(`/api/admin/history/planet/${person.id}/views`).expect(400);
  });

  it("comments: added, edited and deleted by their author, every version kept in the history", async () => {
    const person = await createPerson({ name: "Commented" });
    await admin.post(`/api/admin/history/person/${person.id}/comments`, { body: "I reviewed the profile." }).expect(204);
    let items = (await feed("person", person.id)).items as Item[];
    const comment = items[0]!.comment!;
    expect(items[0]).toMatchObject({ action: "comment_added", comment: { body: "I reviewed the profile.", current: "I reviewed the profile.", mine: true, deleted: false } });

    await admin.patch(`/api/admin/comments/${comment.id}`, { body: "I reviewed the profile and the links." }).expect(204);
    items = (await feed("person", person.id)).items as Item[];
    expect(items[0]).toMatchObject({ action: "comment_edited", changes: [{ before: "I reviewed the profile.", after: "I reviewed the profile and the links." }] });
    expect(items[1]).toMatchObject({ action: "comment_added", comment: { body: "I reviewed the profile.", current: "I reviewed the profile and the links." } });

    await admin.delete(`/api/admin/comments/${comment.id}`).expect(204);
    items = (await feed("person", person.id)).items as Item[];
    expect(items[0]).toMatchObject({ action: "comment_deleted", meta: { body: "I reviewed the profile and the links." } });
    expect(items[2]!.comment).toMatchObject({ mine: false, deleted: true });
    await admin.patch(`/api/admin/comments/${comment.id}`, { body: "Again" }).expect(404);

    // Someone else's comment (here: a former account's) can't be changed.
    const [foreign] = await t.db.insert(recordComments).values({ entityType: "person", entityId: person.id, authorId: null, body: "Not yours" }).returning();
    const refused = await admin.patch(`/api/admin/comments/${foreign!.id}`, { body: "Mine now" }).expect(403);
    expect(refused.body.error.code).toBe("forbidden");
    await admin.post(`/api/admin/history/person/${person.id}/comments`, { body: "   " }).expect(400);
  });

  it("archives and restores organizations and Treasury entries; archived entries leave the public Treasury", async () => {
    const organization = (await admin.post("/api/admin/organizations", { name: "To Archive" }).expect(201)).body;
    await admin.post(`/api/admin/organizations/${organization.id}/archive`).expect(200);
    expect(((await admin.get("/api/admin/organizations?pageSize=100").expect(200)).body.items as { id: string }[]).some((item) => item.id === organization.id)).toBe(false);
    await admin.delete(`/api/admin/organizations/${organization.id}`).send({ confirm: "To Archive" }).expect(204);
    expect((await t.db.select().from(auditEvents).where(eq(auditEvents.entityId, organization.id))).map((event) => event.action)).toEqual(["created", "archived", "deleted"]);

    const [entry] = await t.db
      .insert(treasuryEntries)
      .values({ entryType: "expense", name: "Domain name", currency: "CHF", grossAmount: -1500, source: "manual", managedBy: "native", livemode: true, occurredOn: "2026-10-02" })
      .returning();
    await admin.post(`/api/admin/treasury/${entry!.id}/archive`).expect(200);
    await admin.post(`/api/admin/treasury/${entry!.id}/restore`).expect(200);
    expect(((await feed("treasury_entry", entry!.id)).items as Item[]).map((item) => item.action)).toEqual(["restored", "archived"]);
    await admin.delete(`/api/admin/treasury/${entry!.id}`).send({ confirm: "EXP-0" }).expect(400);
    await admin.delete(`/api/admin/treasury/${entry!.id}`).send({ confirm: `EXP-${entry!.entryNumber}` }).expect(204);
  });

  it("an organization's Submit links and unlinks people in one event, and each person records their own", async () => {
    const organization = (await admin.post("/api/admin/organizations", { name: "Harbor Studio" }).expect(201)).body;
    const ada = await createPerson({ name: "Ada Submit" });
    const ben = await createPerson({ name: "Ben Submit" });
    await admin.patch(`/api/admin/organizations/${organization.id}`, { description: "A studio", personIds: [ada.id, ben.id] }).expect(200);
    let history = await feed("organization", organization.id);
    expect((history.items as Item[]).map((item) => item.action)).toEqual(["updated", "created"]);
    const changes = Object.fromEntries((history.items[0] as Item).changes.map((change) => [change.field, change]));
    expect(Object.keys(changes).sort()).toEqual(["description", "people"]);
    expect(((changes.people!.after as { label: string }[]) ?? []).map((person) => person.label).sort()).toEqual(["Ada Submit", "Ben Submit"]);
    expect(((await feed("person", ada.id)).items as Item[])[0]).toMatchObject({ action: "updated", changes: [{ field: "organizations", after: [{ label: "Harbor Studio" }] }] });

    // Replacing Ben by nobody: one more organization event, one on Ben, none on Ada.
    await admin.patch(`/api/admin/organizations/${organization.id}`, { personIds: [ada.id] }).expect(200);
    history = await feed("organization", organization.id);
    expect(history.edits).toBe(2);
    expect(((await feed("person", ben.id)).items as Item[]).map((item) => item.action)).toEqual(["updated", "updated", "created"]);
    expect(((await feed("person", ada.id)).items as Item[]).map((item) => item.action)).toEqual(["updated", "created"]);
    await admin.patch(`/api/admin/organizations/${organization.id}`, { personIds: ["00000000-0000-4000-8000-000000000000"] }).expect(400);
  });

  it("a Treasury entry's Submit saves the internal note and the review status as one event", async () => {
    const [entry] = await t.db
      .insert(treasuryEntries)
      .values({ entryType: "expense", name: "Printing", currency: "USD", grossAmount: -4200, source: "manual", managedBy: "native", livemode: true, occurredOn: "2026-10-03" })
      .returning();
    await admin.patch(`/api/admin/treasury/${entry!.id}`, { internalNote: "Invoice requested", reviewStatus: "pending_documents" }).expect(200);
    const history = await feed("treasury_entry", entry!.id);
    expect(history.items).toHaveLength(1);
    const changes = (history.items[0] as Item).changes;
    expect(changes.map((change) => change.field)).toEqual(["internalNote", "reviewStatus"]);
    expect(changes[1]).toMatchObject({ kind: "select", after: { key: "pending_documents", label: "Pending documents" } });
    const [stored] = await t.db.select().from(treasuryEntries).where(eq(treasuryEntries.id, entry!.id));
    expect(stored).toMatchObject({ internalNote: "Invoice requested", reviewStatusKey: "pending_documents" });
    expect(stored!.reviewedAt).not.toBeNull();
    // Without a recipient, Qualified is refused and nothing is saved.
    await admin.patch(`/api/admin/treasury/${entry!.id}`, { internalNote: "Changed", reviewStatus: "qualified" }).expect(400);
    expect((await t.db.select().from(treasuryEntries).where(eq(treasuryEntries.id, entry!.id)))[0]!.internalNote).toBe("Invoice requested");
    await admin.patch(`/api/admin/treasury/${entry!.id}`, {}).expect(400);
  });

  it("lists every event on the History page, filtered by record type, actor, source and dates", async () => {
    const all = (await admin.get("/api/admin/history?pageSize=200").expect(200)).body;
    expect(all.total).toBeGreaterThan(10);
    expect(all.items[0]).toHaveProperty("entity.label");
    const organizationsOnly = (await admin.get("/api/admin/history?entityType=organization&pageSize=200").expect(200)).body;
    expect(new Set(organizationsOnly.items.map((item: { entity: { type: string } }) => item.entity.type))).toEqual(new Set(["organization"]));
    expect((await admin.get("/api/admin/history?actor=automation").expect(200)).body.total).toBe(0);
    const [actor] = (await admin.get("/api/admin/history/actors").expect(200)).body;
    expect(actor).toMatchObject({ label: "owner" });
    expect((await admin.get(`/api/admin/history?actor=${actor.id}&source=admin&from=2026-10-17&to=2026-10-17`).expect(200)).body.items.every((item: { occurredAt: string }) => item.occurredAt.startsWith("2026-10-17"))).toBe(true);
    // The History page sends the viewer's own day as instants (from included, to excluded).
    const zurichDay = (await admin.get(`/api/admin/history?from=${encodeURIComponent("2026-10-16T00:00:00+02:00")}&to=${encodeURIComponent("2026-10-17T00:00:00+02:00")}&pageSize=200`).expect(200)).body;
    expect(zurichDay.total).toBeGreaterThan(0);
    expect(zurichDay.items.every((item: { occurredAt: string }) => item.occurredAt >= "2026-10-15T22:00:00.000Z" && item.occurredAt < "2026-10-16T22:00:00.000Z")).toBe(true);
    await admin.get("/api/admin/history?from=yesterday").expect(400);
    await admin.get("/api/admin/history?entityType=planet").expect(400);
  });
});

describe("field privacy (config, enforced by the API)", () => {
  const changes: AuditChange[] = [
    { field: "email", label: "Email", kind: "email", privacy: "contact", before: "stanley@example.org", after: "s.qiang@example.net" },
    { field: "phone", label: "Phone", kind: "text", privacy: "contact", before: null, after: "+41 79 123 45 67" },
    { field: "personalNote", label: "Personal note", kind: "text", privacy: "private_note", before: "Old", after: "New" },
    { field: "website", label: "Website", kind: "url", before: null, after: "https://workana.com" },
  ];

  it("masks contact details for every role by default, as in the prototype", () => {
    for (const role of ["owner", "admin", "viewer"]) {
      const [email, phone, note, website] = visibleChanges(changes, role);
      expect(email).toMatchObject({ before: "s•••@example.org", after: "s•••@example.net", masked: true });
      expect(phone).toMatchObject({ before: null, after: "+•••", masked: true });
      expect(note).toMatchObject({ before: null, after: null, redacted: true });
      expect(website).toEqual(changes[3]);
    }
  });

  it("shows contact details to a role the config allows; never a private note", () => {
    const access = { owner: ["contact"] as const, admin: [] };
    const [email, , note] = visibleChanges(changes, "owner", access);
    expect(email).toEqual(changes[0]);
    expect(note).toMatchObject({ redacted: true, before: null, after: null });
    expect(visibleChanges(changes, "admin", access)[0]).toMatchObject({ masked: true });
    expect(canRead("owner", "private_note", { owner: ["contact", "private_note"] })).toBe(false);
    expect(canRead("unknown", "contact", access)).toBe(false);
    expect(maskText("a@b.c")).toBe("a•••@b.c");
  });
});
