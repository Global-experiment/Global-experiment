import { z } from "zod";
import { TREASURY_CURRENCIES } from "./treasury.schema.js";

/** Public Treasury routes (/api/treasury/*): queries (validated) and responses (stable JSON, no personal data). */

/** "a,b" or repeated params → a de-duplicated list. */
const list = <T extends z.ZodType<string, string>>(item: T) =>
  z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((value) => [...new Set((Array.isArray(value) ? value : value ? value.split(",") : []).map((part) => part.trim()).filter(Boolean))])
    .pipe(z.array(item).max(20));

export const PUBLIC_SORTS = ["date_desc", "date_asc", "amount_desc", "amount_asc"] as const;

export const PublicEntriesQuery = z.strictObject({
  /** expense, or donation (donations with their refunds and disputes); absent = both. */
  type: z.enum(["expense", "donation"]).optional(),
  currency: list(z.enum(TREASURY_CURRENCIES)),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  expenseType: list(z.string().regex(/^[a-z][a-z0-9_]{0,39}$/, "Unknown expense type.")),
  /** Search (p11's search field): the public description, an expense type, or the entry number ("12", "EXP-12"). */
  q: z.string().trim().max(100).optional(),
  sort: z.enum(PUBLIC_SORTS).default("date_desc"),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type PublicEntriesQuery = z.output<typeof PublicEntriesQuery>;

/** Without a currency: the stats currency setting (treasury.stats_currency). */
export const PublicOverviewQuery = z.strictObject({ currency: z.enum(TREASURY_CURRENCIES).optional() });
export type PublicOverviewQuery = z.output<typeof PublicOverviewQuery>;

export interface PublicTreasuryEntry {
  /** The public reference (/treasury/expense/:number, /treasury/donation/:number). */
  number: number;
  type: "donation" | "expense" | "refund" | "dispute";
  currency: string;
  /** Signed minor units: expenses and refunds are negative. */
  amount: number;
  cadence: string;
  occurredOn: string;
  occurredAt: string | null;
  publishedAt: string;
  /** Qualified or Not required; false → "Not qualified yet" (only listed while treasury.publish_unqualified is on). */
  qualified: boolean;
  /** Only once qualified (the view hides it before). */
  description: string | null;
  expenseTypes: { key: string; label: string }[];
  /** Only while treasury.public_recipient_names is on. */
  recipient: { kind: "person" | "organization"; name: string } | null;
  /** The donation a refund or dispute adjusts. */
  adjustsNumber: number | null;
  /** A Stripe test-mode (sandbox) donation shown in production before go-live (treasury.show_test_donations): marked Test. */
  test: boolean;
}

export interface PublicTreasuryOverview {
  currency: string;
  wiseConnected: boolean;
  /** Balance and Sustainability are sample figures (treasury.sample_figures, before Wise): the page says so. */
  sampleFigures: boolean;
  /** Null until Wise is connected (never estimated), unless sample figures are set. */
  balance: number | null;
  sustainability: number | null;
  /** Percent change from 30 days earlier, one decimal (Balance and Sustainability: the samples'); null without a base. */
  trends: { balance: number | null; sustainability: number | null; medianDonation: number | null; expenses: number | null };
  medianDonation: number | null;
  donationCount: number;
  /** Positive minor units: what the published expenses in this currency add up to. */
  expensesTotal: number;
  expenseCount: number;
  /** The "Cry for donation" banner (treasury.donation_appeal). */
  donationAppeal: boolean;
  /** The search, sort, filter and currency controls (treasury.public_toolbar; off by default since 2026-10-19). */
  publicToolbar: boolean;
  lastUpdatedAt: string | null;
  /** Only filter values that have public data. */
  filters: { currencies: string[]; expenseTypes: { key: string; label: string }[]; firstDate: string | null; lastDate: string | null };
}
