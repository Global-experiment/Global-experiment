import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq, sql } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { zurichDate } from "../common/clock/clock.js";
import { FILE_STORAGE, LocalDiskStorage } from "../files/file-storage.js";
import { organizations } from "../organizations/organizations.schema.js";
import { people } from "../people/people.schema.js";
import { RevalidationService } from "../revalidation/revalidation.service.js";
import { settings } from "../settings/settings.schema.js";
import { signedInAdmin, signedInAs, testPrincipal, type SignedInAdmin } from "../testing/admin-session.js";
import { createTestApp, TEST_ORIGIN, type TestApp } from "../testing/test-app.js";
import { TreasuryListQuery } from "./treasury-admin.contracts.js";
import { TreasuryAdminService } from "./treasury-admin.service.js";
import { publicStripeModes } from "./treasury-ledger.repository.js";
import { treasuryDocuments } from "./treasury-documents.schema.js";
import { treasuryEntries, treasuryEntryExpenseTypes } from "./treasury.schema.js";

/**
 * The Treasury through the real HTTP stack (roadmap 1b): what the public
 * sees (published, public mode, settings), the admin's rules and actions,
 * the expense detail page's editing (OPS-155) and the absence of supporting
 * documents (ADR 021). Fixtures live in this file only.
 */

const PDF = Buffer.from("%PDF-1.7\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n");

type EntryValues = typeof treasuryEntries.$inferInsert;

const day = (date: string, time = "12:00:00") => new Date(`${date}T${time}Z`);

function expense(values: Partial<EntryValues> & { occurredOn: string; grossAmount: number }): EntryValues {
  const reviewed = values.reviewStatusKey === undefined || ["qualified", "not_required"].includes(values.reviewStatusKey);
  return {
    managedBy: "notion",
    notionPageId: randomUUID(),
    entryType: "expense",
    name: "Hosting",
    currency: "USD",
    feeAmount: 0,
    netAmount: values.grossAmount,
    cadence: "one_off",
    source: "wise",
    livemode: true,
    occurredAt: day(values.occurredOn),
    reviewStatusKey: "qualified",
    publicationStatus: "published",
    publishedAt: day(values.occurredOn, "13:00:00"),
    publicDescription: reviewed ? "Server hosting for the platform" : null,
    ...values,
  };
}

function donation(values: Partial<EntryValues> & { occurredOn: string; grossAmount: number }): EntryValues {
  return {
    managedBy: "native",
    entryType: "donation",
    name: "Anonymous donation",
    currency: "USD",
    cadence: "one_off",
    source: "stripe",
    livemode: false,
    externalTransactionId: `ch_${Math.random().toString(36).slice(2)}`,
    occurredAt: day(values.occurredOn),
    reviewStatusKey: "not_required",
    publicationStatus: "published",
    publishedAt: day(values.occurredOn, "13:00:00"),
    publicDescription: "Anonymous donation",
    ...values,
  };
}

describe("Treasury API", () => {
  let t: TestApp;
  let admin: SignedInAdmin;
  let storageDir: string;
  const revalidate = vi.fn(async () => true);
  const anonymous = () => request(t.app.getHttpServer());

  beforeAll(async () => {
    storageDir = await mkdtemp(join(tmpdir(), "ge-files-"));
    t = await createTestApp({}, [
      { provide: FILE_STORAGE, useValue: new LocalDiskStorage(storageDir) },
      { provide: RevalidationService, useValue: { revalidate } },
    ]);
    admin = await signedInAdmin(t);
  });
  afterAll(async () => {
    await t.close();
    await rm(storageDir, { recursive: true, force: true });
  });
  beforeEach(async () => {
    revalidate.mockClear();
    await t.db.delete(treasuryDocuments);
    await t.db.delete(treasuryEntryExpenseTypes);
    // Adjustments first (they reference their donation).
    await t.db.execute(sql`delete from treasury_entries where adjusts_entry_id is not null`);
    await t.db.delete(treasuryEntries);
    await t.db.delete(settings);
    await t.db.delete(people);
    await t.db.delete(organizations);
  });

  const setting = (key: string, value: unknown) => t.db.insert(settings).values({ key, value }).onConflictDoUpdate({ target: settings.key, set: { value } });

  async function insert(values: EntryValues, expenseTypes: string[] = []) {
    // A qualified expense has exactly one recipient (a database rule): give it one when the test doesn't care which.
    const needsRecipient =
      values.entryType === "expense" &&
      ["qualified", "not_required"].includes(values.reviewStatusKey ?? "") &&
      !values.recipientPersonId &&
      !values.recipientOrganizationId;
    if (needsRecipient) values = { ...values, recipientPersonId: (await recipient(`Recipient ${randomUUID().slice(0, 8)}`)).id };
    const [row] = await t.db.insert(treasuryEntries).values(values).returning();
    if (expenseTypes.length > 0) await t.db.insert(treasuryEntryExpenseTypes).values(expenseTypes.map((typeKey) => ({ entryId: row!.id, typeKey })));
    return row!;
  }

  async function recipient(name = "Ada Lovelace") {
    const [person] = await t.db.insert(people).values({ name }).returning();
    return person!;
  }

  describe("public", () => {
    it("lists only published entries of the public mode, newest first, with the expense types", async () => {
      const person = await recipient();
      await insert(expense({ occurredOn: "2026-10-01", grossAmount: -5000, recipientPersonId: person.id }), ["hosting_and_infrastructure"]);
      await insert(
        expense({ occurredOn: "2026-10-02", grossAmount: -1200, publicationStatus: "unpublished", publishedAt: null, recipientPersonId: person.id }),
      );
      // Not production and a test key: the public mode is test mode, so this test-mode donation is public…
      await insert(donation({ occurredOn: "2026-10-03", grossAmount: 500 }));
      // …and a live one is not.
      await insert(donation({ occurredOn: "2026-10-04", grossAmount: 700, livemode: true }));

      const res = await anonymous().get("/api/treasury/entries").expect(200);
      expect(res.body.total).toBe(2);
      expect(res.body.items.map((entry: { type: string; amount: number }) => [entry.type, entry.amount])).toEqual([
        ["donation", 500],
        ["expense", -5000],
      ]);
      // Outside production every Stripe entry is a test one: no Test mark.
      expect(res.body.items[0].test).toBe(false);
      const [, spent] = res.body.items;
      expect(spent).toMatchObject({
        currency: "USD",
        qualified: true,
        description: "Server hosting for the platform",
        expenseTypes: [{ key: "hosting_and_infrastructure", label: "Hosting and infrastructure" }],
        recipient: null,
      });
      // Nothing private ever leaves: no ids, notes, names, Notion or Stripe references.
      expect(Object.keys(spent).sort()).toEqual(
        [
          "adjustsNumber",
          "amount",
          "cadence",
          "currency",
          "description",
          "expenseTypes",
          "number",
          "occurredAt",
          "occurredOn",
          "publishedAt",
          "qualified",
          "recipient",
          "test",
          "type",
        ].sort(),
      );
    });

    it("shows unqualified entries only while treasury.publish_unqualified is on, without their description", async () => {
      await insert(expense({ occurredOn: "2026-10-01", grossAmount: -5000, reviewStatusKey: "unqualified", publicDescription: "Not yet public" }));
      expect((await anonymous().get("/api/treasury/entries").expect(200)).body.total).toBe(0);

      await setting("treasury.publish_unqualified", true);
      const [entry] = (await anonymous().get("/api/treasury/entries").expect(200)).body.items;
      expect(entry).toMatchObject({ qualified: false, description: null, amount: -5000 });
      await anonymous().get(`/api/treasury/entries/${entry.number}`).expect(200);

      await setting("treasury.publish_unqualified", false);
      await anonymous().get(`/api/treasury/entries/${entry.number}`).expect(404);
    });

    it("shows a recipient's name only while treasury.public_recipient_names is on", async () => {
      const person = await recipient("Ada Lovelace");
      const [organization] = await t.db.insert(organizations).values({ name: "Hosting Co" }).returning();
      await insert(expense({ occurredOn: "2026-10-01", grossAmount: -100, recipientPersonId: person.id }));
      await insert(expense({ occurredOn: "2026-10-02", grossAmount: -200, recipientOrganizationId: organization!.id }));
      const names = async () => (await anonymous().get("/api/treasury/entries").expect(200)).body.items.map((entry: { recipient: unknown }) => entry.recipient);

      expect(await names()).toEqual([null, null]);
      const off = await anonymous().get("/api/treasury/entries").expect(200);
      expect(JSON.stringify(off.body)).not.toContain("Ada Lovelace");

      await setting("treasury.public_recipient_names", true);
      expect(await names()).toEqual([
        { kind: "organization", name: "Hosting Co" },
        { kind: "person", name: "Ada Lovelace" },
      ]);
    });

    it("filters by type, currency, dates and expense type; sorts; pages", async () => {
      await insert(expense({ occurredOn: "2026-09-01", grossAmount: -900 }), ["legal_and_compliance"]);
      await insert(expense({ occurredOn: "2026-10-01", grossAmount: -100, currency: "EUR", netAmount: -100 }), ["hosting_and_infrastructure"]);
      const gift = await insert(donation({ occurredOn: "2026-10-05", grossAmount: 300 }));
      await insert({
        ...donation({ occurredOn: "2026-10-06", grossAmount: -300 }),
        entryType: "refund",
        name: "Donation refund",
        adjustsEntryId: gift.id,
        publicDescription: "Refunded donation",
      });
      const amounts = async (query: string) =>
        (await anonymous().get(`/api/treasury/entries?${query}`).expect(200)).body.items.map((entry: { amount: number }) => entry.amount);

      expect(await amounts("type=expense")).toEqual([-100, -900]);
      // Donations include their refunds and disputes.
      expect(await amounts("type=donation")).toEqual([-300, 300]);
      expect(await amounts("currency=EUR")).toEqual([-100]);
      expect(await amounts("currency=EUR,USD&from=2026-10-01&to=2026-10-05")).toEqual([300, -100]);
      expect(await amounts("expenseType=legal_and_compliance")).toEqual([-900]);
      expect(await amounts("sort=amount_desc")).toEqual([-900, -300, 300, -100]);
      expect(await amounts("sort=date_asc")).toEqual([-900, -100, 300, -300]);
      const page = (await anonymous().get("/api/treasury/entries?pageSize=3&page=2").expect(200)).body;
      expect(page).toMatchObject({ total: 4, page: 2, pageSize: 3 });
      expect(page.items).toHaveLength(1);

      const refund = (await anonymous().get("/api/treasury/entries?type=donation").expect(200)).body.items[0];
      expect(refund).toMatchObject({ type: "refund", adjustsNumber: gift.entryNumber });

      await anonymous().get("/api/treasury/entries?currency=GBP").expect(400);
      await anonymous().get("/api/treasury/entries?sort=name").expect(400);
      await anonymous().get("/api/treasury/entries?pageSize=500").expect(400);
      await anonymous().get("/api/treasury/entries/abc").expect(400);
    });

    it("gives the overview per currency: expenses, median donation, banner, filter values; Balance and Sustainability stay hidden", async () => {
      await insert(expense({ occurredOn: "2026-09-01", grossAmount: -900 }), ["legal_and_compliance"]);
      await insert(expense({ occurredOn: "2026-10-01", grossAmount: -100 }), ["hosting_and_infrastructure"]);
      await insert(expense({ occurredOn: "2026-10-02", grossAmount: -5000, publicationStatus: "unpublished", publishedAt: null }), ["general_operations"]);
      await insert(donation({ occurredOn: "2026-10-05", grossAmount: 300 }));
      await insert(donation({ occurredOn: "2026-10-06", grossAmount: 700 }));

      const usd = (await anonymous().get("/api/treasury/overview?currency=USD").expect(200)).body;
      expect(usd).toMatchObject({
        currency: "USD",
        wiseConnected: false,
        balance: null,
        sustainability: null,
        expensesTotal: 1000,
        expenseCount: 2,
        medianDonation: 500,
        donationCount: 2,
        donationAppeal: false,
        filters: {
          currencies: ["USD"],
          expenseTypes: [
            { key: "legal_and_compliance", label: "Legal and compliance" },
            { key: "hosting_and_infrastructure", label: "Hosting and infrastructure" },
          ],
          firstDate: "2026-09-01",
          lastDate: "2026-10-06",
        },
      });
      expect(usd.lastUpdatedAt).toEqual(expect.any(String));
      const eur = (await anonymous().get("/api/treasury/overview?currency=EUR").expect(200)).body;
      expect(eur).toMatchObject({ expensesTotal: 0, expenseCount: 0, medianDonation: null });

      await setting("treasury.donation_appeal", true);
      await setting("treasury.wise_connected", true);
      const appeal = (await anonymous().get("/api/treasury/overview?currency=USD").expect(200)).body;
      expect(appeal).toMatchObject({ donationAppeal: true, wiseConnected: true });
    });

    it("answers 404 for an entry that isn't public", async () => {
      const hidden = await insert(expense({ occurredOn: "2026-10-02", grossAmount: -1200, publicationStatus: "unpublished", publishedAt: null }));
      await anonymous().get(`/api/treasury/entries/${hidden.entryNumber}`).expect(404);
      await anonymous().get("/api/treasury/entries/999999").expect(404);
    });

    it("without a currency, the overview uses treasury.stats_currency; it reports the public toolbar setting (off by default)", async () => {
      const usd = (await anonymous().get("/api/treasury/overview").expect(200)).body;
      expect(usd).toMatchObject({ currency: "USD", publicToolbar: false });
      await setting("treasury.stats_currency", "CHF");
      await setting("treasury.public_toolbar", true);
      expect((await anonymous().get("/api/treasury/overview").expect(200)).body).toMatchObject({ currency: "CHF", publicToolbar: true });
      expect((await anonymous().get("/api/treasury/overview?currency=EUR").expect(200)).body.currency).toBe("EUR");
      await anonymous().get("/api/treasury/overview?currency=GBP").expect(400);
    });

    it("searches public text only: the description, an expense type, the entry number; wildcards are literal", async () => {
      const hosting = await insert(expense({ occurredOn: "2026-10-01", grossAmount: -5000, publicDescription: "Server hosting for the platform" }), [
        "hosting_and_infrastructure",
      ]);
      const legal = await insert(
        expense({ occurredOn: "2026-10-02", grossAmount: -2000, publicDescription: "Advice on the statutes", name: "Secret internal name" }),
        ["legal_and_compliance"],
      );
      const search = async (q: string) =>
        (await anonymous().get("/api/treasury/entries").query({ q }).expect(200)).body.items.map((entry: { number: number }) => entry.number);

      expect(await search("HOSTING")).toEqual([hosting.entryNumber]);
      expect(await search("legal and")).toEqual([legal.entryNumber]);
      expect(await search(`EXP-${legal.entryNumber}`)).toEqual([legal.entryNumber]);
      expect(await search(String(hosting.entryNumber))).toEqual([hosting.entryNumber]);
      // The entry's name is private; LIKE wildcards match only themselves.
      expect(await search("Secret")).toEqual([]);
      expect(await search("%")).toEqual([]);
      expect(await search("_")).toEqual([]);
      await anonymous()
        .get("/api/treasury/entries")
        .query({ q: "x".repeat(101) })
        .expect(400);
    });

    it("sample data (before go-live): sample entries are marked Test; sample Balance and Sustainability; trends from 30 days earlier", async () => {
      const daysAgo = (days: number) => zurichDate(new Date(Date.now() - days * 86_400_000));
      await insert(expense({ occurredOn: daysAgo(60), grossAmount: -10_000 }));
      await insert(expense({ occurredOn: daysAgo(5), grossAmount: -2_500, managedBy: "native", notionPageId: null, source: "manual", sample: true }));
      await insert(donation({ occurredOn: daysAgo(40), grossAmount: 400 }));
      await insert(donation({ occurredOn: daysAgo(3), grossAmount: 1_000 }));

      const before = (await anonymous().get("/api/treasury/overview?currency=USD").expect(200)).body;
      expect(before).toMatchObject({ sampleFigures: false, balance: null, sustainability: null, trends: { balance: null, sustainability: null } });
      // Expenses 100 → 125: +25%; median donation 4 → 7: +75%.
      expect(before.trends).toMatchObject({ expenses: 25, medianDonation: 75 });

      await setting("treasury.sample_figures", { balance: { USD: 9_130_000 }, sustainability: 1.4, trends: { balance: 2.1, sustainability: 2.1 } });
      const usd = (await anonymous().get("/api/treasury/overview?currency=USD").expect(200)).body;
      expect(usd).toMatchObject({
        wiseConnected: false,
        sampleFigures: true,
        balance: 9_130_000,
        sustainability: 1.4,
        trends: { balance: 2.1, sustainability: 2.1 },
      });
      expect((await anonymous().get("/api/treasury/overview?currency=EUR").expect(200)).body).toMatchObject({
        sampleFigures: true,
        balance: null,
        sustainability: 1.4,
      });
      // Once Wise is connected, samples are ignored.
      await setting("treasury.wise_connected", true);
      expect((await anonymous().get("/api/treasury/overview?currency=USD").expect(200)).body).toMatchObject({
        sampleFigures: false,
        balance: null,
        sustainability: null,
      });

      const entries = (await anonymous().get("/api/treasury/entries?type=expense").expect(200)).body.items;
      expect(entries.map((entry: { amount: number; test: boolean }) => [entry.amount, entry.test])).toEqual([
        [-2_500, true],
        [-10_000, false],
      ]);
    });
  });

  describe("admin", () => {
    it("requires a session", async () => {
      for (const path of ["/api/admin/treasury", "/api/admin/treasury/options", "/api/admin/treasury/00000000-0000-4000-8000-000000000000"]) {
        expect((await anonymous().get(path).expect(401)).body.error.code).toBe("unauthenticated");
      }
    });

    it("lists entries with their columns, filters and search", async () => {
      const person = await recipient("Ada Lovelace");
      await insert(expense({ occurredOn: "2026-10-01", grossAmount: -5000, recipientPersonId: person.id }), ["hosting_and_infrastructure"]);
      await insert(donation({ occurredOn: "2026-10-03", grossAmount: 500, feeAmount: 45, netAmount: 455 }));

      const all = (await admin.get("/api/admin/treasury").expect(200)).body;
      expect(all.total).toBe(2);
      const [gift, spent] = all.items;
      expect(gift).toMatchObject({
        type: "donation",
        grossAmount: 500,
        feeAmount: 45,
        netAmount: 455,
        source: "stripe",
        livemode: false,
        publication: "published",
      });
      expect(spent).toMatchObject({
        type: "expense",
        recipient: { kind: "person", name: "Ada Lovelace" },
        expenseTypes: [{ key: "hosting_and_infrastructure", label: "Hosting and infrastructure" }],
        review: { key: "qualified", label: "Qualified" },
      });
      expect(spent).not.toHaveProperty("documents");

      const filtered = async (query: string) =>
        (await admin.get(`/api/admin/treasury?${query}`).expect(200)).body.items.map((row: { type: string }) => row.type);
      expect(await filtered("filter=type:is:expense")).toEqual(["expense"]);
      expect(await filtered("filter=mode:is:test")).toEqual(["donation"]);
      // No "managed by Notion" filter any more (decision of 2026-10-23: the Treasury is edited here only).
      expect((await admin.get("/api/admin/treasury?filter=managed_by:is:notion")).status).toBe(400);
      expect(await filtered("filter=recipient:is_empty")).toEqual(["donation"]);
      expect(await filtered("search=lovelace")).toEqual(["expense"]);
      expect(await filtered(`search=EXP-${spent.number}`)).toEqual(["expense"]);
      expect(await filtered("sort=amount:asc")).toEqual(["expense", "donation"]);
    });

    it("treats an expense copied from Notion like any other: note, review and publication are edited here", async () => {
      const entry = await insert(expense({ occurredOn: "2026-10-01", grossAmount: -5000, recipientPersonId: (await recipient()).id }));
      const record = (await admin.get(`/api/admin/treasury/${entry.id}`).expect(200)).body;
      expect(record).not.toHaveProperty("notionUrl");
      expect(record).not.toHaveProperty("managedBy");
      expect(record.permissions).toMatchObject({
        editInternalNote: true,
        publish: { allowed: false, reason: "Already published." },
        unpublish: { allowed: true },
        review: { allowed: true },
        editExpense: true,
      });
      expect(record).not.toHaveProperty("documentsList");
      await admin.patch(`/api/admin/treasury/${entry.id}`, { internalNote: "Checked the invoice" }).expect(200);
      // A published entry stays reviewed (the publication rules): unpublish first, then review.
      await admin.post(`/api/admin/treasury/${entry.id}/unpublish`).expect(200);
      await admin.post(`/api/admin/treasury/${entry.id}/review`, { reviewStatus: "pending_documents" }).expect(200);
      const [changed] = await t.db.select().from(treasuryEntries).where(eq(treasuryEntries.id, entry.id));
      // Edited in the admin; what it was copied from stays in the data.
      expect(changed).toMatchObject({
        internalNote: "Checked the invoice",
        publicationStatus: "unpublished",
        reviewStatusKey: "pending_documents",
        managedBy: "notion",
        notionPageId: entry.notionPageId,
      });
    });

    it("lets a native Stripe entry change only its internal note and publication", async () => {
      const gift = await insert(donation({ occurredOn: "2026-10-03", grossAmount: 500 }));
      const record = (await admin.patch(`/api/admin/treasury/${gift.id}`, { internalNote: "  Thank-you sent  " }).expect(200)).body;
      expect(record.internalNote).toBe("Thank-you sent");
      expect(record.permissions.review).toMatchObject({ allowed: false, reason: "Donations, refunds and disputes need no review." });

      // Only the note: an amount above zero is refused by the contract, and the business fields are an expense's only.
      expect(record.permissions.editExpense).toBe(false);
      expect((await admin.patch(`/api/admin/treasury/${gift.id}`, { grossAmount: 1 })).status).toBe(400);
      expect((await admin.patch(`/api/admin/treasury/${gift.id}`, { publicDescription: "x" })).body.error.details).toEqual({ reason: "not_an_expense" });
      expect((await admin.patch(`/api/admin/treasury/${gift.id}`, { name: "Renamed" })).status).toBe(409);

      expect((await admin.post(`/api/admin/treasury/${gift.id}/unpublish`).expect(200)).body).toMatchObject({ publication: "unpublished", publishedAt: null });
      expect(revalidate).toHaveBeenCalledWith(["treasury"]);
      expect((await admin.post(`/api/admin/treasury/${gift.id}/publish`).expect(200)).body.publication).toBe("published");
      expect((await admin.post(`/api/admin/treasury/${gift.id}/publish`)).status).toBe(409);
    });

    it("applies the publication and review rules to native expenses", async () => {
      const person = await recipient();
      const unqualified = await insert(
        expense({
          managedBy: "native",
          notionPageId: null,
          source: "manual",
          occurredOn: "2026-10-01",
          grossAmount: -800,
          reviewStatusKey: "unqualified",
          publicationStatus: "unpublished",
          publishedAt: null,
        }),
      );

      let record = (await admin.get(`/api/admin/treasury/${unqualified.id}`).expect(200)).body;
      expect(record.permissions.publish).toMatchObject({ allowed: false, reason: expect.stringContaining("publish_unqualified") });
      // Every status is offered (a recipient can be set in the same save); Qualified and Not required still need one.
      expect(record.permissions.review.options.map((option: { key: string }) => option.key)).toEqual([
        "unqualified",
        "pending_documents",
        "qualified",
        "not_required",
      ]);
      expect((await admin.post(`/api/admin/treasury/${unqualified.id}/publish`)).body.error.details).toEqual({ reason: "cannot_publish" });
      const noRecipient = await admin.post(`/api/admin/treasury/${unqualified.id}/review`, { reviewStatus: "qualified" });
      expect(noRecipient.status).toBe(400);
      expect(noRecipient.body.error.details.issues[0].message).toBe("Qualified and Not required need exactly one recipient.");

      await setting("treasury.publish_unqualified", true);
      record = (await admin.post(`/api/admin/treasury/${unqualified.id}/publish`).expect(200)).body;
      expect(record.publication).toBe("published");

      // Qualifying needs a recipient and, once published, a public description.
      await t.db.update(treasuryEntries).set({ recipientPersonId: person.id }).where(eq(treasuryEntries.id, unqualified.id));
      const missing = await admin.post(`/api/admin/treasury/${unqualified.id}/review`, { reviewStatus: "qualified" });
      expect(missing.status).toBe(409);
      await t.db.update(treasuryEntries).set({ publicDescription: "Accounting software" }).where(eq(treasuryEntries.id, unqualified.id));
      record = (await admin.post(`/api/admin/treasury/${unqualified.id}/review`, { reviewStatus: "qualified" }).expect(200)).body;
      expect(record.review).toEqual({ key: "qualified", label: "Qualified" });
      expect(record.reviewedAt).toEqual(expect.any(String));

      // Back to unqualified while public: refused once the setting is off.
      await setting("treasury.publish_unqualified", false);
      expect((await admin.post(`/api/admin/treasury/${unqualified.id}/review`, { reviewStatus: "unqualified" })).body.error.details).toEqual({
        reason: "cannot_review",
      });
    });

    it("deletes no entry, manual or copied from Notion (OPS-147): Rootadmin included, it is archived and restored instead", async () => {
      const entry = await insert(
        expense({ source: "manual", name: "Legal advice", occurredOn: "2026-09-15", grossAmount: -12000, currency: "CHF", netAmount: -12000 }),
      );
      expect((await admin.delete(`/api/admin/treasury/${entry.id}`).send({ confirm: `EXP-${entry.entryNumber}` })).status).toBe(404);
      await admin.post(`/api/admin/treasury/${entry.id}/archive`).expect(200);
      await admin.post(`/api/admin/treasury/${entry.id}/restore`).expect(200);
      expect((await t.db.select().from(treasuryEntries).where(eq(treasuryEntries.id, entry.id))).length).toBe(1);
    });

    describe("the expense detail page (OPS-155)", () => {
      const organization = async (name: string, archived = false) =>
        (
          await t.db
            .insert(organizations)
            .values({ name, ...(archived ? { archivedAt: new Date() } : {}) })
            .returning()
        )[0]!;
      const unreviewed = (values: Partial<EntryValues> = {}) =>
        insert(
          expense({
            managedBy: "native",
            notionPageId: null,
            source: "manual",
            occurredOn: "2026-10-01",
            grossAmount: -5000,
            reviewStatusKey: "unqualified",
            publicationStatus: "unpublished",
            publishedAt: null,
            ...values,
          }),
        );

      it("has no supporting documents any more: the routes are gone, the record and list don't mention them", async () => {
        const entry = await insert(expense({ occurredOn: "2026-10-01", grossAmount: -5000 }));
        // A row left from before (production has none): never exposed; the one-time deletion removes it (ADR 021).
        const [legacy] = await t.db
          .insert(treasuryDocuments)
          .values({
            entryId: entry.id,
            fileName: "old.pdf",
            contentType: "application/pdf",
            sizeBytes: 10,
            sha256: "a".repeat(64),
            storageKey: `sha256/aa/${"a".repeat(64)}`,
          })
          .returning();
        expect((await admin.get(`/api/admin/treasury/${entry.id}/documents`)).status).toBe(404);
        expect((await admin.get(`/api/admin/treasury/documents/${legacy!.id}`)).status).toBe(404);
        expect((await admin.upload(`/api/admin/treasury/${entry.id}/documents`, "file", PDF, "a.pdf")).status).toBe(404);
        expect((await admin.post(`/api/admin/treasury/documents/${legacy!.id}/archive`)).status).toBe(404);
        expect((await admin.post(`/api/admin/treasury/documents/${legacy!.id}/restore`)).status).toBe(404);
        const record = (await admin.get(`/api/admin/treasury/${entry.id}`).expect(200)).body;
        expect(Object.keys(record)).not.toEqual(expect.arrayContaining(["documents"]));
        expect(record).not.toHaveProperty("documentsList");
        expect(record.permissions).not.toHaveProperty("documents");
        expect((await admin.get("/api/admin/treasury?filter=documents:is_not_empty")).status).toBe(400);
      });

      it("lets the Rootadmin change every business field of an expense in one save: one History event, the net worked out", async () => {
        const entry = await insert(expense({ occurredOn: "2026-10-01", grossAmount: -5000, recipientPersonId: (await recipient("Ada")).id }), [
          "hosting_and_infrastructure",
        ]);
        const studio = await organization("Lumen Design Works");
        const saved = (
          await admin
            .patch(`/api/admin/treasury/${entry.id}`, {
              recipient: { kind: "organization", id: studio.id },
              expenseTypes: ["design_and_product", "hosting_and_infrastructure"],
              name: "  Website redesign  ",
              publicDescription: "New design of the public site",
              occurredOn: "2026-09-30",
              grossAmount: -120050,
              feeAmount: 450,
              cadence: "monthly",
              internalNote: "Invoice kept by the accountants",
            })
            .expect(200)
        ).body;
        expect(saved).toMatchObject({
          recipient: { kind: "organization", id: studio.id, name: "Lumen Design Works" },
          name: "Website redesign",
          publicDescription: "New design of the public site",
          occurredOn: "2026-09-30",
          occurredAt: null,
          grossAmount: -120050,
          feeAmount: 450,
          netAmount: -120500,
          cadence: "monthly",
          internalNote: "Invoice kept by the accountants",
        });
        expect(saved.expenseTypes.map((type: { key: string }) => type.key).sort()).toEqual(["design_and_product", "hosting_and_infrastructure"]);
        // Published: the public Treasury refreshes.
        expect(revalidate).toHaveBeenCalledWith(["treasury"]);

        const [event, ...rest] = (await admin.get(`/api/admin/history/treasury_entry/${entry.id}`).expect(200)).body.items;
        expect(rest.filter((item: { action: string }) => item.action === "updated")).toHaveLength(0);
        expect(event.action).toBe("updated");
        expect(event.changes.map((change: { field: string }) => change.field)).toEqual([
          "recipient",
          "expenseTypes",
          "name",
          "publicDescription",
          "occurredOn",
          "grossAmount",
          "feeAmount",
          "cadence",
          "internalNote",
        ]);
        expect(event.changes.find((change: { field: string }) => change.field === "grossAmount")).toMatchObject({
          // moneyLabel: a no-break space between the code and the amount.
          before: "−USD 50.00",
          after: "−USD 1,200.50",
        });
        expect(event.changes[0]).toMatchObject({ before: [{ label: "Ada" }], after: [{ id: studio.id, label: "Lumen Design Works" }] });

        // Saving the same values again changes nothing and writes no event.
        await admin
          .patch(`/api/admin/treasury/${entry.id}`, {
            name: "Website redesign",
            expenseTypes: ["hosting_and_infrastructure", "design_and_product"],
            cadence: "monthly",
          })
          .expect(200);
        expect((await admin.get(`/api/admin/history/treasury_entry/${entry.id}`).expect(200)).body.items[0].id).toBe(event.id);
        // No fee: no net either (a database rule).
        expect((await admin.patch(`/api/admin/treasury/${entry.id}`, { feeAmount: null }).expect(200)).body).toMatchObject({
          feeAmount: null,
          netAmount: null,
        });
      });

      it("sets a recipient and qualifies the expense in the same save", async () => {
        const entry = await unreviewed();
        const person = await recipient("Grace Hopper");
        const saved = (
          await admin.patch(`/api/admin/treasury/${entry.id}`, { recipient: { kind: "person", id: person.id }, reviewStatus: "qualified" }).expect(200)
        ).body;
        expect(saved).toMatchObject({ recipient: { kind: "person", name: "Grace Hopper" }, review: { key: "qualified" } });
      });

      it("refuses what the rules refuse, with a message on the field", async () => {
        const entry = await insert(expense({ occurredOn: "2026-10-01", grossAmount: -5000 }));
        const issue = async (body: object) => (await admin.patch(`/api/admin/treasury/${entry.id}`, body)).body.error;
        expect((await issue({ grossAmount: 500 })).details.issues[0]).toMatchObject({
          path: "grossAmount",
          message: "An expense's amount is money out: below zero.",
        });
        expect((await issue({ grossAmount: -10.5 })).details.issues[0].message).toBe("Use whole cents.");
        expect((await issue({ feeAmount: -1 })).details.issues[0].message).toBe("A fee is zero or more.");
        expect((await issue({ name: "   " })).details.issues[0].message).toBe("Give the entry a name.");
        expect((await issue({ expenseTypes: ["no_such_type"] })).details.issues[0]).toMatchObject({ path: "expenseTypes", message: "Unknown expense type." });
        expect((await issue({ expenseTypes: ["design_and_product", "design_and_product"] })).details.issues[0].message).toBe("Each expense type once.");
        expect((await issue({ recipient: { kind: "person", id: randomUUID() } })).details.issues[0]).toMatchObject({ path: "recipient" });
        const archived = await organization("Gone Ltd", true);
        expect((await issue({ recipient: { kind: "organization", id: archived.id } })).details.issues[0].message).toBe(
          "This recipient doesn't exist or is archived.",
        );
        // A qualified expense keeps a recipient; a published, reviewed one keeps its public description.
        expect((await issue({ recipient: null })).details.issues[0]).toMatchObject({
          path: "recipient",
          message: "Qualified and Not required need exactly one recipient.",
        });
        expect((await issue({ publicDescription: "  " })).details).toEqual({ reason: "cannot_review" });
        expect(await issue({})).toMatchObject({ code: "validation_failed" });
        const [unchanged] = await t.db.select().from(treasuryEntries).where(eq(treasuryEntries.id, entry.id));
        expect(unchanged).toMatchObject({ grossAmount: -5000, name: "Hosting", publicDescription: "Server hosting for the platform" });
      });

      it("only the Rootadmin edits an expense's details; Admin and Treasury admin keep the note and the review", async () => {
        const entry = await unreviewed();
        for (const role of ["admin", "treasury"] as const) {
          const editor = await signedInAs(t, role, `${role}-ops155@example.org`);
          const record = (await editor.get(`/api/admin/treasury/${entry.id}`).expect(200)).body;
          expect(record.permissions.editExpense).toBe(true);
          const refusedEdit = await editor.patch(`/api/admin/treasury/${entry.id}`, { name: "Renamed" });
          expect(refusedEdit.status).toBe(403);
          expect(refusedEdit.body.error.message).toBe("Only a Rootadmin can edit an expense's details.");
          // A mixed save is refused whole: nothing changes.
          expect((await editor.patch(`/api/admin/treasury/${entry.id}`, { internalNote: "mine", grossAmount: -1 })).status).toBe(403);
          await editor.patch(`/api/admin/treasury/${entry.id}`, { internalNote: `Seen by ${role}` }).expect(200);
        }
        const compliance = await signedInAs(t, "compliance", "compliance-ops155@example.org");
        expect((await compliance.patch(`/api/admin/treasury/${entry.id}`, { cadence: "yearly" })).status).toBe(403);
        expect((await anonymous().patch(`/api/admin/treasury/${entry.id}`).set("origin", TEST_ORIGIN).send({ name: "x" })).status).toBe(401);
        const [after] = await t.db.select().from(treasuryEntries).where(eq(treasuryEntries.id, entry.id));
        expect(after).toMatchObject({ name: "Hosting", grossAmount: -5000, cadence: "one_off", internalNote: "Seen by treasury" });
      });
    });
  });
});

/**
 * Production mode in its own app, after the suite above: on a real
 * PostgreSQL server (`api:test:pg`) every test app resets the shared `_test`
 * database, so it can't be created in the middle of another app's tests.
 */
describe("Treasury API in production", () => {
  let production: TestApp;
  let storageDir: string;

  beforeAll(async () => {
    storageDir = await mkdtemp(join(tmpdir(), "ge-files-"));
    production = await createTestApp({ NODE_ENV: "production", ADMIN_ALLOWED_ORIGINS: "https://globalexperiment.org", JOBS_DRIVER: "inprocess" }, [
      { provide: FILE_STORAGE, useValue: new LocalDiskStorage(storageDir) },
      { provide: RevalidationService, useValue: { revalidate: vi.fn(async () => true) } },
    ]);
  });
  afterAll(async () => {
    await production.close();
    await rm(storageDir, { recursive: true, force: true });
  });
  beforeEach(async () => {
    await production.db.delete(treasuryEntries);
    await production.db.delete(settings);
  });
  const owner = testPrincipal();
  const showTestDonations = () => production.db.insert(settings).values({ key: "treasury.show_test_donations", value: true });

  it("hides Stripe test-mode entries", async () => {
    await production.db
      .insert(treasuryEntries)
      .values([donation({ occurredOn: "2026-10-03", grossAmount: 500 }), donation({ occurredOn: "2026-10-04", grossAmount: 700, livemode: true })]);
    const res = await request(production.app.getHttpServer()).get("/api/treasury/entries").expect(200);
    expect(res.body.items.map((entry: { amount: number }) => entry.amount)).toEqual([700]);
  });

  it("never publishes a Stripe test-mode entry", async () => {
    const [gift] = await production.db
      .insert(treasuryEntries)
      .values(donation({ occurredOn: "2026-10-03", grossAmount: 500, publicationStatus: "unpublished", publishedAt: null }))
      .returning();
    const service = production.app.get(TreasuryAdminService);
    await expect(service.publish(gift!.id, true, owner)).rejects.toMatchObject({ code: "conflict", details: { reason: "cannot_publish" } });
  });

  it("before go-live, with treasury.show_test_donations on, shows test-mode donations marked Test (list, entry, figures, admin)", async () => {
    const [gift] = await production.db
      .insert(treasuryEntries)
      .values([donation({ occurredOn: "2026-10-03", grossAmount: 500 }), donation({ occurredOn: "2026-10-04", grossAmount: 700, livemode: true })])
      .returning();
    const service = production.app.get(TreasuryAdminService);
    const server = production.app.getHttpServer();

    // Off (the default): hidden, and the admin says it isn't public.
    expect((await service.list(TreasuryListQuery.parse({}))).items.find((row) => row.id === gift!.id)).toMatchObject({
      publication: "published",
      publicNow: false,
    });
    await request(server).get(`/api/treasury/entries/${gift!.entryNumber}`).expect(404);

    await showTestDonations();
    const res = await request(server).get("/api/treasury/entries").expect(200);
    expect(res.body.items.map((entry: { amount: number; test: boolean }) => [entry.amount, entry.test])).toEqual([
      [700, false],
      [500, true],
    ]);
    expect((await request(server).get(`/api/treasury/entries/${gift!.entryNumber}`).expect(200)).body).toMatchObject({ amount: 500, test: true });
    const overview = await request(server).get("/api/treasury/overview?currency=USD").expect(200);
    expect(overview.body).toMatchObject({ donationCount: 2, medianDonation: 600 });
    expect(await service.get(gift!.id)).toMatchObject({ publicNow: true, permissions: { unpublish: { allowed: true } } });
  });
});

describe("which Stripe modes the public sees", () => {
  const config = (nodeEnv: string, livemode: boolean) => ({ nodeEnv, stripe: { livemode } }) as never;
  it("production: live only, plus test mode before go-live while the setting is on; a live key ignores the setting", () => {
    expect(publicStripeModes(config("production", false), false)).toEqual([true]);
    expect(publicStripeModes(config("production", false), true)).toEqual([true, false]);
    expect(publicStripeModes(config("production", true), true)).toEqual([true]);
    expect(publicStripeModes(config("production", true), false)).toEqual([true]);
  });
  it("elsewhere: the configured key's mode", () => {
    expect(publicStripeModes(config("development", false), false)).toEqual([false]);
    expect(publicStripeModes(config("development", true), true)).toEqual([true]);
  });
});
