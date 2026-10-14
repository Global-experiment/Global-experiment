import { afterEach, describe, expect, it } from "vitest";
import { asc, eq } from "drizzle-orm";
import type { Database } from "../../common/database/database.module.js";
import { organizations } from "../../organizations/organizations.schema.js";
import { createTestDatabase } from "../../testing/test-app.js";
import { treasuryEntries, treasuryEntryExpenseTypes } from "../../treasury/treasury.schema.js";
import { importRuns } from "../import.schema.js";
import { formatTreasuryReport, runTreasuryImport } from "./treasury-import.js";
import type { SourceTreasuryEntry, TreasurySource } from "./treasury-source.js";

// Test fixtures only.
const page = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, "0")}`;
const ORG_PAGE = page(901);
const expense = (n: number, values: Partial<SourceTreasuryEntry> = {}): SourceTreasuryEntry => ({
  pageId: page(n),
  createdTime: "2026-10-01T10:00:00.000Z",
  number: n,
  name: `Hosting invoice ${n}`,
  entryType: "Expense",
  source: "Wise",
  transactionDate: "2026-10-01",
  netAmount: -120,
  currency: "EUR",
  cadence: "One-off",
  expenseTypes: ["Hosting and infrastructure", "Software and subscriptions"],
  recipientPersonPageIds: [],
  recipientOrganizationPageIds: [ORG_PAGE],
  reviewStatus: "Qualified",
  reviewedOn: "2026-10-02",
  reviewedByCount: 0,
  publicationStatus: "Published",
  publishedOn: "2026-10-03",
  publicDescription: "Monthly hosting of the platform",
  internalNote: "Paid from the Wise EUR balance",
  sourceAccountId: null,
  externalTransactionId: `TRANSFER-${n}`,
  wiseTransactionNumber: null,
  importedAt: null,
  ...values,
});
const source = (entries: SourceTreasuryEntry[]): TreasurySource => ({ entries, layout: { names: {}, unread: [], absent: [] } });

const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

async function database(): Promise<Database> {
  const { db, close } = await createTestDatabase();
  closers.push(close);
  await db.insert(organizations).values({ name: "Hosting Co", notionPageId: ORG_PAGE });
  // A native Stripe donation already holds EXP-1.
  await db.insert(treasuryEntries).values({
    managedBy: "native",
    entryType: "donation",
    name: "Anonymous donation",
    currency: "EUR",
    grossAmount: 500,
    source: "stripe",
    livemode: true,
    externalTransactionId: "ch_live_1",
    occurredOn: "2026-10-01",
    reviewStatusKey: "not_required",
    publicationStatus: "published",
    publishedAt: new Date(),
    publicDescription: "Anonymous donation",
  });
  return db;
}

const run = (db: Database, rows: SourceTreasuryEntry[], apply: boolean) =>
  runTreasuryImport(db, source(rows), { apply, triggeredBy: "test", publishUnqualified: false });

describe("Treasury import (database)", () => {
  it("a dry run writes only its import_runs record", async () => {
    const db = await database();
    const result = await run(db, [expense(7)], false);
    expect(result.mode).toBe("dry_run");
    expect(result.counts).toMatchObject({ created: 1, changes: 1 });
    expect(await db.select().from(treasuryEntries).where(eq(treasuryEntries.managedBy, "notion"))).toEqual([]);
    expect(await db.select({ kind: importRuns.kind, mode: importRuns.mode }).from(importRuns)).toEqual([{ kind: "treasury", mode: "dry_run" }]);
    expect(formatTreasuryReport(result)).toMatch(/TREASURY IMPORT — DRY RUN[\s\S]*fee_unknown[\s\S]*Result: 1 changes\./);
  });

  it("applies in one transaction, Notion-managed, numbers and types kept; idempotent; native rows untouched", async () => {
    const db = await database();
    const [nativeBefore] = await db.select().from(treasuryEntries).where(eq(treasuryEntries.managedBy, "native"));
    const applied = await run(db, [expense(7), expense(1)], true);
    expect(applied.counts).toMatchObject({ created: 2, flagged: 2, changes: 2 });

    const rows = await db.select().from(treasuryEntries).where(eq(treasuryEntries.managedBy, "notion")).orderBy(asc(treasuryEntries.entryNumber));
    expect(rows.map((row) => [row.entryNumber, row.notionPageId, row.grossAmount, row.feeAmount, row.netAmount, row.livemode, row.reviewStatusKey, row.publicationStatus])).toEqual([
      // EXP-1 belongs to the Stripe donation: the database assigned the next free number.
      [7, page(7), -12000, 0, -12000, true, "qualified", "published"],
      [8, page(1), -12000, 0, -12000, true, "qualified", "published"],
    ]);
    expect(rows[0]!.recipientOrganizationId).not.toBeNull();
    const types = await db.select().from(treasuryEntryExpenseTypes).where(eq(treasuryEntryExpenseTypes.entryId, rows[0]!.id));
    expect(types.map((link) => link.typeKey).sort()).toEqual(["hosting_and_infrastructure", "software_and_subscriptions"]);

    // The next entry (e.g. a new Stripe donation) gets a number past Notion's.
    const [next] = await db
      .insert(treasuryEntries)
      .values({ managedBy: "native", entryType: "donation", name: "Anonymous donation", currency: "EUR", grossAmount: 100, source: "stripe", occurredOn: "2026-10-04" })
      .returning({ number: treasuryEntries.entryNumber });
    expect(next!.number).toBe(9);

    const again = await run(db, [expense(7), expense(1)], true);
    expect(again.counts).toMatchObject({ created: 0, updated: 0, unchanged: 2, changes: 0 });
    const [nativeAfter] = await db.select().from(treasuryEntries).where(eq(treasuryEntries.externalTransactionId, "ch_live_1"));
    expect(nativeAfter).toEqual(nativeBefore);
  });

  it("updates synced fields and expense types from Notion", async () => {
    const db = await database();
    await run(db, [expense(7)], true);
    const updated = await run(db, [expense(7, { netAmount: -99.5, expenseTypes: ["Legal and compliance"], internalNote: null })], true);
    expect(updated.counts).toMatchObject({ updated: 1, changes: 1 });
    const [row] = await db.select().from(treasuryEntries).where(eq(treasuryEntries.notionPageId, page(7)));
    expect(row).toMatchObject({ grossAmount: -9950, netAmount: -9950, internalNote: null });
    expect((await db.select().from(treasuryEntryExpenseTypes).where(eq(treasuryEntryExpenseTypes.entryId, row!.id))).map((link) => link.typeKey)).toEqual([
      "legal_and_compliance",
    ]);
  });

  it("refuses an all-demo apply and writes nothing but the failed run record", async () => {
    const db = await database();
    await expect(run(db, [expense(7, { sourceAccountId: "DEMO-EXPENSE" })], true)).rejects.toThrow(/demo rows/);
    expect(await db.select().from(treasuryEntries).where(eq(treasuryEntries.managedBy, "notion"))).toEqual([]);
    expect(await db.select({ mode: importRuns.mode }).from(importRuns)).toEqual([{ mode: "failed" }]);
  });
});
