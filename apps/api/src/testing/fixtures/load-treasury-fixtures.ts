import type { Database } from "../../common/database/database.module.js";
import { stripeSubscriptions } from "../../stripe/stripe.schema.js";
import { STRIPE_ENTRY_TEXT } from "../../treasury/treasury-ledger.repository.js";
import { treasuryEntries } from "../../treasury/treasury.schema.js";

/**
 * Test-only Treasury rows for the donate page's Playwright suite: five USD
 * donations (median $6.40, like Figma's "$6.4"), one active USD monthly
 * donation, nothing in EUR or CHF (their empty state). Written only into the
 * `*_test` database e2e-setup.ts has just wiped; never shipped in the build.
 */
const AMOUNTS = [200, 500, 640, 1000, 5000];

export async function loadTreasuryFixtures(db: Database): Promise<void> {
  const publishedAt = new Date("2026-10-15T12:07:00Z");
  await db.transaction(async (tx) => {
    await tx.insert(stripeSubscriptions).values({
      id: "sub_e2efixture0001",
      livemode: false,
      status: "active",
      currency: "USD",
      amount: 1000,
      startedAt: publishedAt,
    });
    await tx.insert(treasuryEntries).values(
      AMOUNTS.map((amount, index) => ({
        managedBy: "native",
        entryType: "donation",
        name: STRIPE_ENTRY_TEXT.donationName,
        currency: "USD",
        grossAmount: amount,
        feeAmount: Math.round(amount * 0.029) + 30,
        netAmount: amount - (Math.round(amount * 0.029) + 30),
        cadence: index === 3 ? "monthly" : "one_off",
        recurrenceId: index === 3 ? "sub_e2efixture0001" : null,
        source: "stripe",
        // The e2e API runs with a test configuration: these are test-mode rows.
        livemode: false,
        externalTransactionId: `ch_e2efixture000${index + 1}`,
        occurredOn: "2026-10-15",
        occurredAt: publishedAt,
        reviewStatusKey: "not_required",
        publicationStatus: "published",
        publishedAt,
        publicDescription: STRIPE_ENTRY_TEXT.donationDescription,
      })),
    );
  });
}
