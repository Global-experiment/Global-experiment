import type { Database } from "../../common/database/database.module.js";
import { settings } from "../../settings/settings.schema.js";
import { stripeSubscriptions } from "../../stripe/stripe.schema.js";
import { STRIPE_ENTRY_TEXT } from "../../treasury/treasury-ledger.repository.js";
import { treasuryEntries, treasuryEntryExpenseTypes } from "../../treasury/treasury.schema.js";
import { FIXTURE_ORGANIZATIONS, FIXTURE_PEOPLE } from "./directory-fixtures.js";

/**
 * Test-only Treasury rows for the Playwright suites, written only into the
 * `*_test` database e2e-setup.ts has just wiped; never shipped in the build.
 *
 * - Donate: five USD donations (median $6.40, like Figma's "$6.4"), one
 *   active USD monthly donation, no EUR or CHF donation (their empty state).
 * - Treasury: expenses in the shapes Common pages p11/p22 show — an
 *   unqualified one ("Not qualified yet"), one with more tags than fit
 *   ("+N"), the p22 example (USD 5,675, four tags, Apr 6 2:07 PM), one in
 *   EUR, and an unpublished one only the admin sees. Expenses don't change
 *   the donate page's figures.
 * - Settings: unqualified entries may be published, and the "Cry for
 *   donation" banner is on, so both Figma states render.
 *
 * Every id and Notion page id lives in the reserved `de000000-…` range.
 */
const AMOUNTS = [200, 500, 640, 1000, 5000];

const notionPage = (n: number) => `de000000-6000-4000-8000-${n.toString(16).padStart(12, "0")}`;

interface FixtureExpense {
  name: string;
  gross: number;
  currency: "USD" | "EUR" | "CHF";
  at: string;
  review: "unqualified" | "pending_documents" | "qualified";
  published: boolean;
  description: string | null;
  recipient: { person?: string; organization?: string } | null;
  types: string[];
  notion: boolean;
}

export const FIXTURE_EXPENSES: FixtureExpense[] = [
  {
    name: "Payment processing fees",
    gross: -5000,
    currency: "USD",
    at: "2026-10-14T18:46:00Z",
    review: "unqualified",
    published: true,
    description: null,
    recipient: null,
    types: [],
    notion: true,
  },
  {
    name: "Platform tooling",
    gross: -5000,
    currency: "USD",
    at: "2026-10-12T18:46:00Z",
    review: "qualified",
    published: true,
    description: "Yearly tools the platform runs on: hosting, code, design and research subscriptions.",
    recipient: { organization: FIXTURE_ORGANIZATIONS[0]!.id },
    types: ["software_and_subscriptions", "hosting_and_infrastructure", "development_and_engineering", "design_and_product", "research_and_consulting"],
    notion: true,
  },
  {
    name: "Platform development",
    gross: -567500,
    currency: "USD",
    at: "2026-04-06T12:07:00Z",
    review: "qualified",
    published: true,
    description: "Development of the contribution flow, paid to the developer who built it.",
    recipient: { person: FIXTURE_PEOPLE[0]!.id },
    types: ["development_and_engineering", "design_and_product", "general_operations", "research_and_consulting"],
    notion: true,
  },
  {
    name: "Association bank fees",
    gross: -1250,
    currency: "EUR",
    at: "2026-09-30T08:15:00Z",
    review: "qualified",
    published: true,
    description: "Monthly fees of the association's bank account.",
    recipient: { organization: FIXTURE_ORGANIZATIONS[1]!.id },
    types: ["banking_and_payment_processing"],
    notion: false,
  },
  {
    name: "Legal advice",
    gross: -70000,
    currency: "CHF",
    at: "2026-10-10T09:00:00Z",
    review: "pending_documents",
    published: false,
    description: null,
    recipient: null,
    types: ["legal_and_compliance"],
    notion: true,
  },
];

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

    for (const [index, expense] of FIXTURE_EXPENSES.entries()) {
      const at = new Date(expense.at);
      const [row] = await tx
        .insert(treasuryEntries)
        .values({
          managedBy: expense.notion ? "notion" : "native",
          notionPageId: expense.notion ? notionPage(index + 1) : null,
          entryType: "expense",
          name: expense.name,
          currency: expense.currency,
          grossAmount: expense.gross,
          // As the Notion importer records them: fee unknown → 0, net = gross.
          feeAmount: 0,
          netAmount: expense.gross,
          cadence: "one_off",
          source: expense.notion ? "wise" : "manual",
          livemode: true,
          occurredOn: expense.at.slice(0, 10),
          occurredAt: at,
          recipientPersonId: expense.recipient?.person ?? null,
          recipientOrganizationId: expense.recipient?.organization ?? null,
          reviewStatusKey: expense.review,
          publicationStatus: expense.published ? "published" : "unpublished",
          publishedAt: expense.published ? at : null,
          publicDescription: expense.description,
          importedAt: expense.notion ? publishedAt : null,
        })
        .returning({ id: treasuryEntries.id });
      if (expense.types.length > 0) await tx.insert(treasuryEntryExpenseTypes).values(expense.types.map((typeKey) => ({ entryId: row!.id, typeKey })));
    }

    await tx.insert(settings).values([
      { key: "treasury.publish_unqualified", value: true },
      { key: "treasury.donation_appeal", value: true },
    ]);
  });
}
