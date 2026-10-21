import { and, eq, inArray, not, sql } from "drizzle-orm";
import { recordAuditEvent } from "../audit/audit.service.js";
import { AUTOMATION } from "../audit/audit.types.js";
import { entryLabel } from "../audit/entity-labels.js";
import type { Database } from "../common/database/database.module.js";
import { stripeEvents, stripeSubscriptions } from "../stripe/stripe.schema.js";
import { treasuryEntries } from "../treasury/treasury.schema.js";

/**
 * Stripe test-mode rows (livemode = false): what a sandbox checkout leaves in
 * a database — on production during the pre-launch test, or anywhere a test
 * key was used. Live rows and non-Stripe rows (always live) are never
 * touched. Used by purge-test-donations.ts.
 */
export interface TestDonationsPlan {
  entries: { donation: number; refund: number; dispute: number };
  subscriptions: number;
  events: number;
}

const ADJUSTMENTS = ["refund", "dispute"];

export async function planTestDonationsPurge(db: Database): Promise<TestDonationsPlan> {
  const byType = await db
    .select({ type: treasuryEntries.entryType, count: sql<number>`count(*)::int` })
    .from(treasuryEntries)
    .where(not(treasuryEntries.livemode))
    .groupBy(treasuryEntries.entryType);
  const count = (type: string) => byType.find((row) => row.type === type)?.count ?? 0;
  const [subscriptions] = await db.select({ count: sql<number>`count(*)::int` }).from(stripeSubscriptions).where(not(stripeSubscriptions.livemode));
  const [events] = await db.select({ count: sql<number>`count(*)::int` }).from(stripeEvents).where(not(stripeEvents.livemode));
  return {
    entries: { donation: count("donation"), refund: count("refund"), dispute: count("dispute") },
    subscriptions: subscriptions?.count ?? 0,
    events: events?.count ?? 0,
  };
}

/** Deletes every test-mode row in one transaction; returns what it deleted. */
export async function purgeTestDonations(db: Database): Promise<TestDonationsPlan> {
  return db.transaction(async (tx) => {
    const executor = tx as unknown as Database;
    const plan = await planTestDonationsPurge(executor);
    // Adjustments first: a donation can't be deleted while a refund or dispute points at it.
    // Logged before the rows go (Automation: an operator command).
    const doomed = await tx
      .select({ id: treasuryEntries.id, entryNumber: treasuryEntries.entryNumber, grossAmount: treasuryEntries.grossAmount, currency: treasuryEntries.currency })
      .from(treasuryEntries)
      .where(not(treasuryEntries.livemode));
    for (const entry of doomed) {
      await recordAuditEvent(tx, { entityType: "treasury_entry", entityId: entry.id, action: "deleted", actor: AUTOMATION, source: "system", meta: { label: entryLabel(entry), origin: "purge-test-donations" } });
    }
    await tx.delete(treasuryEntries).where(and(not(treasuryEntries.livemode), inArray(treasuryEntries.entryType, ADJUSTMENTS)));
    await tx.delete(treasuryEntries).where(not(treasuryEntries.livemode));
    await tx.delete(stripeSubscriptions).where(eq(stripeSubscriptions.livemode, false));
    await tx.delete(stripeEvents).where(eq(stripeEvents.livemode, false));
    return plan;
  });
}

export function formatTestDonationsPlan(plan: TestDonationsPlan, heading: string): string {
  return [
    heading,
    "",
    `treasury_entries (livemode = false): ${plan.entries.donation} donations, ${plan.entries.refund} refunds, ${plan.entries.dispute} dispute adjustments`,
    `stripe_subscriptions (livemode = false): ${plan.subscriptions}`,
    `stripe_events (livemode = false): ${plan.events}`,
  ].join("\n");
}
