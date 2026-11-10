import { z } from "zod";
import { listQuerySchema } from "../common/listing/list-query.js";
import { TREASURY_CURRENCIES } from "./treasury.schema.js";

/** Request contracts (validated) and response shapes (stable JSON) for /api/admin/treasury. */

const vocabularyKey = z.string().regex(/^[a-z][a-z0-9_]{0,39}$/, "Unknown value.");

export const TREASURY_SORT_FIELDS = ["number", "occurred", "amount", "created", "updated"] as const;
export type TreasurySortField = (typeof TREASURY_SORT_FIELDS)[number];

export const TreasuryListQuery = listQuerySchema({
  sortFields: TREASURY_SORT_FIELDS,
  defaultSort: [
    { field: "occurred", direction: "desc" },
    { field: "number", direction: "desc" },
  ],
  filters: {
    type: { operators: ["is", "is_not"], value: z.enum(["donation", "expense", "refund", "dispute"]) },
    currency: { operators: ["is", "is_not"], value: z.enum(TREASURY_CURRENCIES) },
    review: { operators: ["is", "is_not"], value: vocabularyKey },
    publication: { operators: ["is"], value: z.enum(["published", "unpublished"]) },
    source: { operators: ["is", "is_not"], value: z.enum(["stripe", "wise", "manual"]) },
    /** live = real money; test = Stripe test mode. */
    mode: { operators: ["is"], value: z.enum(["live", "test"]) },
    expense_type: { operators: ["is", "is_empty", "is_not_empty"], value: vocabularyKey },
    recipient: { operators: ["is_empty", "is_not_empty"] },
    occurred_from: { operators: ["is"], value: z.iso.date() },
    occurred_to: { operators: ["is"], value: z.iso.date() },
    /** The "Archived" view (decision 12): without this filter, archived entries are left out. */
    archived: { operators: ["is"], value: z.enum(["true", "false"]).transform((value) => value === "true") },
  },
});

export type TreasuryListQuery = z.output<typeof TreasuryListQuery>;

const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .transform((value) => value.trim() || null)
    .nullable()
    .optional();

/** An amount in minor units (cents): whole, and within what a bigint column and JavaScript both hold exactly. */
const minorUnits = z.number().int("Use whole cents.").safe();

/**
 * What "Submit changes" sends, applied together (one history event):
 * - the internal note (treasury.update) and the review status (treasury.review);
 * - on an expense, its business fields (treasury.manage, the Rootadmin; OPS-155): recipient, expense types,
 *   name, public description, date, amount, fee and cadence. Amounts are minor units, as stored: an expense's
 *   amount is negative (money out), its fee zero or more; the net is always amount − fee, worked out here.
 */
export const UpdateTreasuryEntryRequest = z
  .strictObject({
    internalNote: optionalText(5000),
    reviewStatus: vocabularyKey.optional(),
    recipient: z
      .strictObject({ kind: z.enum(["person", "organization"]), id: z.uuid("Invalid recipient.") })
      .nullable()
      .optional(),
    expenseTypes: z
      .array(vocabularyKey)
      .max(20)
      .refine((keys) => new Set(keys).size === keys.length, "Each expense type once.")
      .optional(),
    name: z.string().trim().min(1, "Give the entry a name.").max(200, "At most 200 characters.").optional(),
    publicDescription: optionalText(2000),
    occurredOn: z.iso.date("Choose a date.").optional(),
    grossAmount: minorUnits.negative("An expense's amount is money out: below zero.").optional(),
    feeAmount: minorUnits.nonnegative("A fee is zero or more.").nullable().optional(),
    cadence: z.enum(["one_off", "monthly", "yearly"]).optional(),
  })
  .refine((body) => Object.values(body).some((value) => value !== undefined), "Nothing to update.");

/** The fields of UpdateTreasuryEntryRequest that only an expense has and only treasury.manage changes. */
export const EXPENSE_FIELDS = ["recipient", "expenseTypes", "name", "publicDescription", "occurredOn", "grossAmount", "feeAmount", "cadence"] as const;
export type UpdateTreasuryEntryRequest = z.output<typeof UpdateTreasuryEntryRequest>;

export const ReviewTreasuryEntryRequest = z.strictObject({ reviewStatus: vocabularyKey });
export type ReviewTreasuryEntryRequest = z.output<typeof ReviewTreasuryEntryRequest>;

export interface VocabularyEntry {
  key: string;
  label: string;
}

export interface TreasuryRecipient {
  kind: "person" | "organization";
  id: string;
  name: string;
}

export interface TreasuryEntryRowDto {
  id: string;
  /** EXP-n. */
  number: number;
  type: "donation" | "expense" | "refund" | "dispute";
  name: string;
  occurredOn: string;
  occurredAt: string | null;
  currency: string;
  /** Minor units. */
  grossAmount: number;
  feeAmount: number | null;
  netAmount: number | null;
  settlement: { currency: string; grossAmount: number; feeAmount: number; netAmount: number; exchangeRate: string } | null;
  cadence: string;
  recipient: TreasuryRecipient | null;
  expenseTypes: VocabularyEntry[];
  review: VocabularyEntry;
  publication: "published" | "unpublished";
  publishedAt: string | null;
  /**
   * Visible on the public Treasury right now: published, of a public Stripe
   * mode, and reviewed unless treasury.publish_unqualified is on.
   */
  publicNow: boolean;
  source: "stripe" | "wise" | "manual";
  livemode: boolean;
  /** Sample data before go-live (marked Test publicly; purge-sample-treasury removes it). */
  sample: boolean;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface TreasuryEntryDto extends TreasuryEntryRowDto {
  externalTransactionId: string | null;
  sourceAccountId: string | null;
  reviewedAt: string | null;
  publicDescription: string | null;
  internalNote: string | null;
  importedAt: string | null;
  /** The donation a refund or dispute adjusts. */
  adjusts: { id: string; number: number } | null;
  /** Refunds and dispute adjustments of a donation. */
  adjustments: { id: string; number: number; type: string; grossAmount: number }[];
  /** What the admin may do on this entry (rules + settings), so the page never offers a refused action. */
  permissions: {
    editInternalNote: boolean;
    /** An expense's business fields (treasury.manage decides who; this says whether the entry allows it). */
    editExpense: boolean;
    publish: { allowed: boolean; reason: string | null };
    unpublish: { allowed: boolean; reason: string | null };
    /** `options`: every status the entry can take; Qualified and Not required need a recipient (checked on save). */
    review: { allowed: boolean; reason: string | null; options: VocabularyEntry[] };
  };
}

export interface TreasuryOptionsDto {
  expenseTypes: VocabularyEntry[];
  reviewStatuses: VocabularyEntry[];
  currencies: readonly string[];
  settings: { publishUnqualified: boolean; publicRecipientNames: boolean; wiseConnected: boolean };
}
