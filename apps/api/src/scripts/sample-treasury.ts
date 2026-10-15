import { count, eq, inArray } from "drizzle-orm";
import { zurichDate } from "../common/clock/clock.js";
import type { Database } from "../common/database/database.module.js";
import { organizations } from "../organizations/organizations.schema.js";
import type { SampleFigures } from "../settings/settings.registry.js";
import { settings } from "../settings/settings.schema.js";
import { treasuryDocuments } from "../treasury/treasury-documents.schema.js";
import { treasuryEntries, treasuryEntryExpenseTypes, type TreasuryCurrency } from "../treasury/treasury.schema.js";

/**
 * Sample Treasury data for production before go-live (owner's decision,
 * 2026-10-15): expenses, and sample Balance and Sustainability figures, so
 * the public Treasury shows the Figma's full page. Every sample entry is
 * `sample = true` and shown marked "Test"; the figures say they are samples.
 * Donations are never sampled: they come from Stripe only.
 *
 * `npm run api:seed-sample-treasury -- --confirm` adds them (dry run by
 * default); `npm run api:purge-sample-treasury -- --confirm` removes every
 * sample entry and the sample figures.
 */

interface SampleExpense {
  name: string;
  currency: TreasuryCurrency;
  /** Major units, spent (positive here; stored negative). */
  amount: number;
  daysAgo: number;
  types: string[];
  description: string;
}

/** USD adds up to 39,800 (the Figma's "39.8K"), spread over five months so the trends have a base. */
export const SAMPLE_EXPENSES: readonly SampleExpense[] = [
  { name: "Platform development", currency: "USD", amount: 12_000, daysAgo: 140, types: ["development_and_engineering", "design_and_product"], description: "Development of the contribution and donation flows." },
  { name: "Server hosting", currency: "USD", amount: 1_250, daysAgo: 120, types: ["hosting_and_infrastructure"], description: "Hosting of the platform and its databases for the year." },
  { name: "Association registration", currency: "CHF", amount: 700, daysAgo: 100, types: ["legal_and_compliance", "accounting_and_administration"], description: "Registration of the association in Switzerland." },
  { name: "Accessibility audit", currency: "USD", amount: 3_600, daysAgo: 95, types: ["research_and_consulting", "design_and_product"], description: "An independent accessibility audit of the public pages." },
  { name: "Design system", currency: "USD", amount: 5_400, daysAgo: 80, types: ["design_and_product"], description: "Design of the shared components and page templates." },
  { name: "Legal advice", currency: "USD", amount: 2_800, daysAgo: 70, types: ["legal_and_compliance"], description: "Legal advice on the association's statutes." },
  { name: "Accounting", currency: "USD", amount: 1_900, daysAgo: 60, types: ["accounting_and_administration"], description: "Annual accounts and bookkeeping set-up." },
  { name: "Facilitation workshop", currency: "EUR", amount: 1_800, daysAgo: 50, types: ["general_operations", "communication_and_content"], description: "A facilitated workshop with the first contributors." },
  { name: "Software subscriptions", currency: "USD", amount: 640, daysAgo: 45, types: ["software_and_subscriptions"], description: "Design, analytics and collaboration tools." },
  { name: "Translation", currency: "USD", amount: 2_350, daysAgo: 35, types: ["communication_and_content"], description: "Translation of the documentation into Spanish." },
  { name: "Frontend milestone", currency: "USD", amount: 6_500, daysAgo: 20, types: ["development_and_engineering"], description: "The public pages: directory, treasury and donate." },
  { name: "Office supplies", currency: "CHF", amount: 70, daysAgo: 15, types: ["general_operations"], description: "Office supplies for the association." },
  { name: "Security assessment", currency: "USD", amount: 2_800, daysAgo: 12, types: ["research_and_consulting", "hosting_and_infrastructure"], description: "A security review of the platform and its hosting." },
  { name: "Bank fees", currency: "EUR", amount: 18, daysAgo: 8, types: ["banking_and_payment_processing"], description: "Monthly fees of the association's bank account." },
  { name: "Payment processing fees", currency: "USD", amount: 160, daysAgo: 5, types: ["banking_and_payment_processing"], description: "Card processing fees for the month." },
  { name: "Monthly bookkeeping", currency: "USD", amount: 400, daysAgo: 2, types: ["accounting_and_administration", "general_operations"], description: "Bookkeeping for the month." },
];

/** The Figma's "$ 91.3K +2.1%" and "1.4 +2.1%"; EUR and CHF in proportion. */
export const SAMPLE_FIGURES: SampleFigures = {
  balance: { USD: 9_130_000, EUR: 2_450_000, CHF: 1_180_000 },
  sustainability: 1.4,
  trends: { balance: 2.1, sustainability: 2.1 },
};

const SAMPLE_FIGURES_KEY = "treasury.sample_figures";

/**
 * A reviewed expense has exactly one recipient (database rule). The samples
 * share this one organization (admin only: recipient names stay private
 * while treasury.public_recipient_names is off); the purge removes it.
 */
export const SAMPLE_RECIPIENT = {
  id: "5a3f1e00-0000-4000-8000-000000000001",
  name: "Sample recipient (test data)",
  description: "Recipient of the sample Treasury expenses shown before go-live. Removed by purge-sample-treasury.",
} as const;

export interface SamplePlan {
  /** Sample expenses per currency. */
  expenses: Record<string, number>;
  figures: boolean;
}

function planOf(rows: { currency: string }[], figures: boolean): SamplePlan {
  const expenses: Record<string, number> = {};
  for (const row of rows) expenses[row.currency] = (expenses[row.currency] ?? 0) + 1;
  return { expenses, figures };
}

/** What the seed would add. */
export const planSampleSeed = (): SamplePlan => planOf([...SAMPLE_EXPENSES], true);

/** What is there now (what the purge would remove). */
export async function planSamplePurge(db: Database): Promise<SamplePlan> {
  const rows = await db.select({ currency: treasuryEntries.currency }).from(treasuryEntries).where(eq(treasuryEntries.sample, true));
  const [figures] = await db.select({ n: count() }).from(settings).where(eq(settings.key, SAMPLE_FIGURES_KEY));
  return planOf(rows, (figures?.n ?? 0) > 0);
}

export function formatSamplePlan(plan: SamplePlan, heading: string): string {
  const expenses = Object.entries(plan.expenses)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, n]) => `${n} ${currency}`)
    .join(", ");
  return [heading, `sample expenses: ${expenses || "none"}`, `sample Balance and Sustainability figures: ${plan.figures ? "yes" : "no"}`].join("\n");
}

/** Adds the sample expenses (published, "Not required", marked Test publicly) and figures, in one transaction. */
export async function seedSampleTreasury(db: Database, now: Date): Promise<SamplePlan> {
  return db.transaction(async (tx) => {
    const [existing] = await tx.select({ n: count() }).from(treasuryEntries).where(eq(treasuryEntries.sample, true));
    if ((existing?.n ?? 0) > 0) throw new Error(`${existing!.n} sample entries are already there: purge them first (purge-sample-treasury).`);
    await tx.insert(organizations).values(SAMPLE_RECIPIENT).onConflictDoNothing({ target: organizations.id });
    for (const expense of SAMPLE_EXPENSES) {
      const day = new Date(now.getTime() - expense.daysAgo * 86_400_000);
      // A working-hours time on that day (UTC), varied per entry so the rows don't all read the same.
      const occurredAt = new Date(`${day.toISOString().slice(0, 10)}T${String(8 + (expense.amount % 9)).padStart(2, "0")}:${String(expense.amount % 60).padStart(2, "0")}:00Z`);
      const [entry] = await tx
        .insert(treasuryEntries)
        .values({
          managedBy: "native",
          entryType: "expense",
          name: expense.name,
          currency: expense.currency,
          grossAmount: -expense.amount * 100,
          source: "manual",
          livemode: true,
          sample: true,
          occurredOn: zurichDate(occurredAt),
          occurredAt,
          recipientOrganizationId: SAMPLE_RECIPIENT.id,
          reviewStatusKey: "not_required",
          reviewedAt: now,
          publicationStatus: "published",
          publishedAt: now,
          publicDescription: expense.description,
          internalNote: "Sample entry (before go-live): removed by purge-sample-treasury.",
        })
        .returning({ id: treasuryEntries.id });
      await tx.insert(treasuryEntryExpenseTypes).values(expense.types.map((typeKey) => ({ entryId: entry!.id, typeKey })));
    }
    await tx
      .insert(settings)
      .values({ key: SAMPLE_FIGURES_KEY, value: SAMPLE_FIGURES })
      .onConflictDoUpdate({ target: settings.key, set: { value: SAMPLE_FIGURES } });
    return planSampleSeed();
  });
}

/** Removes every sample entry (their expense types go with them), the sample recipient and figures. Refuses while a sample has documents. */
export async function purgeSampleTreasury(db: Database): Promise<SamplePlan> {
  return db.transaction(async (tx) => {
    const samples = await tx.select({ id: treasuryEntries.id, currency: treasuryEntries.currency }).from(treasuryEntries).where(eq(treasuryEntries.sample, true));
    const ids = samples.map((row) => row.id);
    if (ids.length > 0) {
      const [documents] = await tx.select({ n: count() }).from(treasuryDocuments).where(inArray(treasuryDocuments.entryId, ids));
      if ((documents?.n ?? 0) > 0) throw new Error(`${documents!.n} documents are attached to sample entries: delete them in the admin first.`);
      await tx.delete(treasuryEntries).where(inArray(treasuryEntries.id, ids));
    }
    // The sample recipient goes too, unless a real entry was linked to it since.
    const [linked] = await tx.select({ n: count() }).from(treasuryEntries).where(eq(treasuryEntries.recipientOrganizationId, SAMPLE_RECIPIENT.id));
    if ((linked?.n ?? 0) === 0) await tx.delete(organizations).where(eq(organizations.id, SAMPLE_RECIPIENT.id));
    const removedFigures = await tx.delete(settings).where(eq(settings.key, SAMPLE_FIGURES_KEY)).returning({ key: settings.key });
    return planOf(samples, removedFigures.length > 0);
  });
}
