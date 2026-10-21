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
    managed_by: { operators: ["is"], value: z.enum(["notion", "native"]) },
    expense_type: { operators: ["is", "is_empty", "is_not_empty"], value: vocabularyKey },
    recipient: { operators: ["is_empty", "is_not_empty"] },
    occurred_from: { operators: ["is"], value: z.iso.date() },
    occurred_to: { operators: ["is"], value: z.iso.date() },
    documents: { operators: ["is_empty", "is_not_empty"] },
    /** The "Archived" view (decision 12): without this filter, archived entries are left out. */
    archived: { operators: ["is"], value: z.enum(["true", "false"]).transform((value) => value === "true") },
  },
});

/** Permanent delete (owner only, manual entries only, decision 12): the entry number typed exactly ("EXP-12"). */
export const DeleteTreasuryEntryRequest = z.strictObject({ confirm: z.string().max(40) });
export type DeleteTreasuryEntryRequest = z.output<typeof DeleteTreasuryEntryRequest>;
export type TreasuryListQuery = z.output<typeof TreasuryListQuery>;

/** What "Submit changes" sends: the internal note and/or the review status, applied together (one history event). */
export const UpdateTreasuryEntryRequest = z
  .strictObject({
    internalNote: z
      .string()
      .max(5000)
      .transform((value) => value.trim() || null)
      .nullable()
      .optional(),
    reviewStatus: vocabularyKey.optional(),
  })
  .refine((body) => body.internalNote !== undefined || body.reviewStatus !== undefined, "Nothing to update.");
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
  managedBy: "notion" | "native";
  documents: number;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface TreasuryDocumentDto {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  uploadedAt: string;
  uploadedBy: string | null;
}

export interface TreasuryEntryDto extends TreasuryEntryRowDto {
  notionPageId: string | null;
  /** The Notion page, for Notion-managed entries. */
  notionUrl: string | null;
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
  documentsList: TreasuryDocumentDto[];
  /** What the admin may do on this entry (rules + settings), so the page never offers a refused action. */
  permissions: {
    editInternalNote: boolean;
    publish: { allowed: boolean; reason: string | null };
    unpublish: { allowed: boolean; reason: string | null };
    review: { allowed: boolean; reason: string | null; options: VocabularyEntry[] };
    documents: boolean;
  };
}

export interface TreasuryOptionsDto {
  expenseTypes: VocabularyEntry[];
  reviewStatuses: VocabularyEntry[];
  currencies: readonly string[];
  settings: { publishUnqualified: boolean; publicRecipientNames: boolean; wiseConnected: boolean };
}
