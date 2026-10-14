import { afterEach, describe, expect, it } from "vitest";
import type { Database } from "../common/database/database.module.js";
import { stripeEvents, stripeSubscriptions } from "../stripe/stripe.schema.js";
import { createTestDatabase } from "../testing/test-app.js";
import { treasuryEntries } from "../treasury/treasury.schema.js";
import { formatTestDonationsPlan, planTestDonationsPurge, purgeTestDonations } from "./test-donations-purge.js";

const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

const stripeRow = (livemode: boolean, external: string, values: Partial<typeof treasuryEntries.$inferInsert> = {}): typeof treasuryEntries.$inferInsert => ({
  managedBy: "native",
  entryType: "donation",
  name: "Anonymous donation",
  currency: "EUR",
  grossAmount: 1000,
  source: "stripe",
  livemode,
  externalTransactionId: external,
  occurredOn: "2026-10-15",
  ...values,
});

async function seed(db: Database) {
  await db.insert(stripeSubscriptions).values([
    { id: "sub_test1", livemode: false, status: "active", currency: "EUR", amount: 500, startedAt: new Date() },
    { id: "sub_live1", livemode: true, status: "active", currency: "EUR", amount: 500, startedAt: new Date() },
  ]);
  const [testDonation] = await db.insert(treasuryEntries).values(stripeRow(false, "ch_test1")).returning({ id: treasuryEntries.id });
  await db.insert(treasuryEntries).values([
    stripeRow(false, "re_test1", { entryType: "refund", name: "Donation refund", grossAmount: -400, adjustsEntryId: testDonation!.id }),
    stripeRow(false, "txn_test1", { entryType: "dispute", name: "Payment disputed", grossAmount: -600, adjustsEntryId: testDonation!.id }),
    stripeRow(false, "ch_test2", { cadence: "monthly", recurrenceId: "sub_test1", grossAmount: 500 }),
    stripeRow(true, "ch_live1"),
    stripeRow(true, "ch_live2", { cadence: "monthly", recurrenceId: "sub_live1", grossAmount: 500 }),
    { ...stripeRow(true, "manual-1"), source: "manual", externalTransactionId: null, entryType: "expense", name: "Hosting", grossAmount: -900 },
  ]);
  await db.insert(stripeEvents).values([
    { id: "evt_test1", type: "checkout.session.completed", livemode: false, stripeCreatedAt: new Date() },
    { id: "evt_live1", type: "checkout.session.completed", livemode: true, stripeCreatedAt: new Date() },
  ]);
}

describe("purge of Stripe test-mode rows", () => {
  it("plans, then deletes only test-mode entries, subscriptions and events, in one go", async () => {
    const { db, close } = await createTestDatabase();
    closers.push(close);
    await seed(db);

    const plan = await planTestDonationsPurge(db);
    expect(plan).toEqual({ entries: { donation: 2, refund: 1, dispute: 1 }, subscriptions: 1, events: 1 });
    expect(formatTestDonationsPlan(plan, "DRY RUN")).toContain("2 donations, 1 refunds, 1 dispute adjustments");
    // The plan changes nothing.
    expect(await db.select().from(treasuryEntries)).toHaveLength(7);

    expect(await purgeTestDonations(db)).toEqual(plan);
    expect((await db.select({ id: treasuryEntries.externalTransactionId, livemode: treasuryEntries.livemode }).from(treasuryEntries)).sort((a, b) => String(a.id).localeCompare(String(b.id)))).toEqual([
      { id: "ch_live1", livemode: true },
      { id: "ch_live2", livemode: true },
      { id: null, livemode: true },
    ]);
    expect((await db.select({ id: stripeSubscriptions.id }).from(stripeSubscriptions)).map((row) => row.id)).toEqual(["sub_live1"]);
    expect((await db.select({ id: stripeEvents.id }).from(stripeEvents)).map((row) => row.id)).toEqual(["evt_live1"]);
    expect(await planTestDonationsPurge(db)).toEqual({ entries: { donation: 0, refund: 0, dispute: 0 }, subscriptions: 0, events: 0 });
  });
});
