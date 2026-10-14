import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  char,
  check,
  date,
  index,
  integer,
  numeric,
  pgTable,
  pgView,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { adminUsers } from "../auth/auth.schema.js";
import { organizations } from "../organizations/organizations.schema.js";
import { people } from "../people/people.schema.js";
import { stripeSubscriptions } from "../stripe/stripe.schema.js";

/**
 * Treasury ledger (docs/architecture/data-model.md §4): donations, expenses,
 * refunds and dispute adjustments in one table, amounts in integer minor units (cents) and
 * per currency — never converted, never floats. Every business rule the
 * database can hold is a CHECK or a trigger (migration 0006), not UI logic.
 */

const vocabularyColumns = {
  key: text("key").primaryKey(),
  label: text("label").notNull(),
  sortOrder: integer("sort_order").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
};

/** Unqualified ("Not qualified yet" in public), Pending documents, Qualified, Not required. */
export const treasuryReviewStatuses = pgTable("treasury_review_statuses", vocabularyColumns, (table) => [
  check("treasury_review_statuses_key_shape", sql`${table.key} ~ '^[a-z][a-z0-9_]{0,39}$'`),
  check("treasury_review_statuses_label_present", sql`length(btrim(${table.label})) between 1 and 60`),
]);

/** Notion's 10 "*Expense type" options (decided 2026-10-15). */
export const treasuryExpenseTypes = pgTable("treasury_expense_types", vocabularyColumns, (table) => [
  check("treasury_expense_types_key_shape", sql`${table.key} ~ '^[a-z][a-z0-9_]{0,39}$'`),
  check("treasury_expense_types_label_present", sql`length(btrim(${table.label})) between 1 and 60`),
]);

export const TREASURY_CURRENCIES = ["EUR", "USD", "CHF"] as const;
export type TreasuryCurrency = (typeof TREASURY_CURRENCIES)[number];

export const treasuryEntries = pgTable(
  "treasury_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** EXP-n (Notion's prefix for every entry), preserved from Notion on import. */
    entryNumber: integer("entry_number").notNull().generatedByDefaultAsIdentity(),
    notionPageId: uuid("notion_page_id"),
    managedBy: text("managed_by").notNull().default("native"),
    entryType: text("entry_type").notNull(),
    name: text("name").notNull(),
    currency: char("currency", { length: 3 }).notNull(),
    grossAmount: bigint("gross_amount", { mode: "number" }).notNull(),
    feeAmount: bigint("fee_amount", { mode: "number" }),
    netAmount: bigint("net_amount", { mode: "number" }),
    settlementCurrency: char("settlement_currency", { length: 3 }),
    settlementGrossAmount: bigint("settlement_gross_amount", { mode: "number" }),
    settlementFeeAmount: bigint("settlement_fee_amount", { mode: "number" }),
    settlementNetAmount: bigint("settlement_net_amount", { mode: "number" }),
    exchangeRate: numeric("exchange_rate", { precision: 18, scale: 8 }),
    cadence: text("cadence").notNull().default("one_off"),
    source: text("source").notNull(),
    /** Stripe test vs live mode, from the event (data-model §4.1). Non-Stripe entries are always real (true). */
    livemode: boolean("livemode").notNull().default(true),
    externalTransactionId: text("external_transaction_id"),
    recurrenceId: text("recurrence_id").references(() => stripeSubscriptions.id, { onDelete: "restrict" }),
    sourceAccountId: text("source_account_id"),
    occurredOn: date("occurred_on", { mode: "string" }).notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }),
    recipientPersonId: uuid("recipient_person_id").references(() => people.id, { onDelete: "restrict" }),
    recipientOrganizationId: uuid("recipient_organization_id").references(() => organizations.id, { onDelete: "restrict" }),
    adjustsEntryId: uuid("adjusts_entry_id").references((): AnyPgColumn => treasuryEntries.id, { onDelete: "restrict" }),
    reviewStatusKey: text("review_status_key")
      .notNull()
      .default("unqualified")
      .references(() => treasuryReviewStatuses.key, { onDelete: "restrict", onUpdate: "cascade" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedByAdminId: uuid("reviewed_by_admin_id").references(() => adminUsers.id, { onDelete: "set null" }),
    publicationStatus: text("publication_status").notNull().default("unpublished"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    publicDescription: text("public_description"),
    internalNote: text("internal_note"),
    importedAt: timestamp("imported_at", { withTimezone: true }),
    createdByAdminId: uuid("created_by_admin_id").references(() => adminUsers.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("treasury_entries_entry_number_unique").on(table.entryNumber),
    uniqueIndex("treasury_entries_notion_page_id_unique").on(table.notionPageId).where(sql`${table.notionPageId} is not null`),
    // Stripe and Wise syncs are idempotent: one row per provider transaction.
    uniqueIndex("treasury_entries_source_external_unique")
      .on(table.source, table.externalTransactionId)
      .where(sql`${table.externalTransactionId} is not null`),
    index("treasury_entries_published_idx").on(table.occurredOn.desc()).where(sql`${table.publicationStatus} = 'published'`),
    index("treasury_entries_entry_type_idx").on(table.entryType),
    index("treasury_entries_currency_idx").on(table.currency),
    index("treasury_entries_recipient_person_idx").on(table.recipientPersonId),
    index("treasury_entries_recipient_organization_idx").on(table.recipientOrganizationId),
    index("treasury_entries_adjusts_idx").on(table.adjustsEntryId),
    index("treasury_entries_recurrence_idx").on(table.recurrenceId),
    // Test-mode Stripe rows: hidden from the public, purged by the purge-test-donations command.
    index("treasury_entries_test_mode_idx").on(table.createdAt).where(sql`not ${table.livemode}`),
    // Fee reconciliation: Stripe entries whose fee isn't known yet.
    index("treasury_entries_fee_pending_idx")
      .on(table.createdAt)
      .where(sql`${table.source} = 'stripe' and ${table.feeAmount} is null and ${table.settlementCurrency} is null`),

    check("treasury_entries_entry_number_positive", sql`${table.entryNumber} > 0`),
    check("treasury_entries_managed_by_known", sql`${table.managedBy} in ('notion', 'native')`),
    check("treasury_entries_notion_managed_has_page", sql`${table.managedBy} = 'native' or ${table.notionPageId} is not null`),
    check("treasury_entries_entry_type_known", sql`${table.entryType} in ('donation', 'expense', 'refund', 'dispute')`),
    check("treasury_entries_name_present", sql`length(btrim(${table.name})) between 1 and 200`),
    check("treasury_entries_currency_known", sql`${table.currency} in ('EUR', 'USD', 'CHF')`),
    // Signs: money in is positive, money out (expenses, refunds) negative; a dispute
    // adjustment is negative when Stripe withdraws the funds, positive when they're reinstated.
    check(
      "treasury_entries_gross_sign",
      sql`(${table.entryType} = 'donation' and ${table.grossAmount} > 0) or (${table.entryType} in ('expense', 'refund') and ${table.grossAmount} < 0) or (${table.entryType} = 'dispute' and ${table.grossAmount} <> 0)`,
    ),
    // Fees are costs (≥ 0), except on disputes: Stripe may give the dispute fee back when it's won.
    check("treasury_entries_fee_not_negative", sql`${table.feeAmount} is null or ${table.feeAmount} >= 0 or ${table.entryType} = 'dispute'`),
    check("treasury_entries_fee_and_net_together", sql`(${table.feeAmount} is null) = (${table.netAmount} is null)`),
    check("treasury_entries_net_is_gross_minus_fee", sql`${table.feeAmount} is null or ${table.netAmount} = ${table.grossAmount} - ${table.feeAmount}`),
    // Every column is tested for null explicitly: a CHECK that evaluates to
    // NULL passes, so `exchange_rate > 0` alone would let a missing rate in.
    check(
      "treasury_entries_settlement_together",
      sql`(${table.settlementCurrency} is null and ${table.settlementGrossAmount} is null and ${table.settlementFeeAmount} is null and ${table.settlementNetAmount} is null and ${table.exchangeRate} is null)
        or (${table.settlementCurrency} is not null and ${table.settlementGrossAmount} is not null and ${table.settlementFeeAmount} is not null and ${table.settlementNetAmount} is not null and ${table.exchangeRate} is not null
            and ${table.settlementCurrency} ~ '^[A-Z]{3}$' and ${table.settlementCurrency} <> ${table.currency} and (${table.settlementFeeAmount} >= 0 or ${table.entryType} = 'dispute')
            and ${table.settlementNetAmount} = ${table.settlementGrossAmount} - ${table.settlementFeeAmount} and ${table.exchangeRate} > 0)`,
    ),
    check("treasury_entries_cadence_known", sql`${table.cadence} in ('one_off', 'monthly', 'yearly')`),
    // No yearly donations (decided 2026-10-15); yearly stays for Notion expenses.
    check("treasury_entries_no_yearly_donation", sql`${table.entryType} <> 'donation' or ${table.cadence} <> 'yearly'`),
    check("treasury_entries_source_known", sql`${table.source} in ('stripe', 'wise', 'manual')`),
    // Only Stripe has a test mode; everything else is real money.
    check("treasury_entries_livemode_stripe_only", sql`${table.source} = 'stripe' or ${table.livemode}`),
    check("treasury_entries_external_id_length", sql`${table.externalTransactionId} is null or length(${table.externalTransactionId}) between 1 and 255`),
    check("treasury_entries_source_account_length", sql`${table.sourceAccountId} is null or length(${table.sourceAccountId}) <= 255`),
    check("treasury_entries_recurrence_monthly", sql`${table.recurrenceId} is null or (${table.entryType} = 'donation' and ${table.cadence} = 'monthly')`),
    // A refund or dispute adjustment always points to the donation it adjusts; nothing else does.
    check("treasury_entries_adjustment_links_donation", sql`(${table.entryType} in ('refund', 'dispute')) = (${table.adjustsEntryId} is not null)`),
    // Recipients: never on donations or refunds; at most one on an expense; exactly one once qualified.
    check(
      "treasury_entries_recipient_rules",
      sql`(${table.entryType} = 'expense' or (${table.recipientPersonId} is null and ${table.recipientOrganizationId} is null))
        and not (${table.recipientPersonId} is not null and ${table.recipientOrganizationId} is not null)
        and (${table.entryType} <> 'expense' or ${table.reviewStatusKey} not in ('qualified', 'not_required')
             or (${table.recipientPersonId} is null) <> (${table.recipientOrganizationId} is null))`,
    ),
    check("treasury_entries_publication_known", sql`${table.publicationStatus} in ('unpublished', 'published')`),
    check("treasury_entries_published_at_matches", sql`(${table.publicationStatus} = 'published') = (${table.publishedAt} is not null)`),
    // A published, reviewed entry explains itself publicly (Q25 keeps unqualified ones open).
    check(
      "treasury_entries_published_description",
      sql`${table.publicationStatus} <> 'published' or ${table.reviewStatusKey} not in ('qualified', 'not_required') or length(btrim(coalesce(${table.publicDescription}, ''))) > 0`,
    ),
    check("treasury_entries_public_description_length", sql`${table.publicDescription} is null or length(${table.publicDescription}) <= 2000`),
    check("treasury_entries_internal_note_length", sql`${table.internalNote} is null or length(${table.internalNote}) <= 5000`),
  ],
);

/** An expense's categories (only expenses: enforced by a trigger, migration 0006). */
export const treasuryEntryExpenseTypes = pgTable(
  "treasury_entry_expense_types",
  {
    entryId: uuid("entry_id")
      .notNull()
      .references(() => treasuryEntries.id, { onDelete: "cascade" }),
    typeKey: text("type_key")
      .notNull()
      .references(() => treasuryExpenseTypes.key, { onDelete: "restrict", onUpdate: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.entryId, table.typeKey] }), index("treasury_entry_expense_types_type_idx").on(table.typeKey)],
);

/**
 * The only shape the public API reads (created by migration 0006, not managed
 * by drizzle-kit): published entries, public columns, and the description
 * only once the entry is qualified or needs no review.
 */
export const treasuryPublicEntries = pgView("treasury_public_entries", {
  id: uuid("id").notNull(),
  entryNumber: integer("entry_number").notNull(),
  entryType: text("entry_type").notNull(),
  currency: char("currency", { length: 3 }).notNull(),
  grossAmount: bigint("gross_amount", { mode: "number" }).notNull(),
  netAmount: bigint("net_amount", { mode: "number" }),
  cadence: text("cadence").notNull(),
  occurredOn: date("occurred_on", { mode: "string" }).notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }),
  publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
  reviewStatusKey: text("review_status_key").notNull(),
  recurrenceId: text("recurrence_id"),
  adjustsEntryId: uuid("adjusts_entry_id"),
  source: text("source").notNull(),
  livemode: boolean("livemode").notNull(),
  publicDescription: text("public_description"),
}).existing();
