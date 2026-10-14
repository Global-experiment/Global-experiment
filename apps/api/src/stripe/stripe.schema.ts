import { sql } from "drizzle-orm";
import { bigint, boolean, char, check, index, integer, pgTable, text, timestamp, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";
// Mutual import with treasury.schema (entries ↔ subscriptions): safe because
// foreign-key targets are lazy callbacks, read only after both modules load.
import { treasuryEntries } from "../treasury/treasury.schema.js";

/**
 * Stripe bookkeeping (docs/architecture/data-model.md §4.4, §4.4b). No
 * payloads, customers, emails or names are stored: only ids, types and
 * statuses — what exactly-once processing and the "Monthly donors" stat need.
 */

/** Every webhook event received, processed exactly once (in one transaction with its ledger writes). */
export const stripeEvents = pgTable(
  "stripe_events",
  {
    id: text("id").primaryKey(),
    type: text("type").notNull(),
    livemode: boolean("livemode").notNull(),
    objectId: text("object_id"),
    stripeCreatedAt: timestamp("stripe_created_at", { withTimezone: true }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    status: text("status").notNull().default("received"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    entryId: uuid("entry_id").references((): AnyPgColumn => treasuryEntries.id, { onDelete: "set null" }),
  },
  (table) => [
    check("stripe_events_id_shape", sql`${table.id} ~ '^evt_[A-Za-z0-9]+$'`),
    check("stripe_events_type_present", sql`length(${table.type}) between 1 and 100`),
    check("stripe_events_status_known", sql`${table.status} in ('received', 'processed', 'ignored', 'failed')`),
    check("stripe_events_attempts_not_negative", sql`${table.attempts} >= 0`),
    check("stripe_events_processed_at_matches", sql`(${table.status} in ('processed', 'ignored')) = (${table.processedAt} is not null)`),
    check("stripe_events_last_error_length", sql`${table.lastError} is null or length(${table.lastError}) <= 1000`),
    index("stripe_events_pending_idx").on(table.receivedAt).where(sql`${table.status} in ('received', 'failed')`),
    index("stripe_events_entry_idx").on(table.entryId),
  ],
);

/** Monthly donations (behind the donations.monthly flag): what groups charges and counts "Monthly donors". */
export const stripeSubscriptions = pgTable(
  "stripe_subscriptions",
  {
    id: text("id").primaryKey(),
    /** Test vs live mode: test subscriptions never count as Monthly donors in production. */
    livemode: boolean("livemode").notNull(),
    status: text("status").notNull(),
    currency: char("currency", { length: 3 }).notNull(),
    amount: bigint("amount", { mode: "number" }).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    canceledAt: timestamp("canceled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("stripe_subscriptions_id_shape", sql`${table.id} ~ '^sub_[A-Za-z0-9]+$'`),
    check("stripe_subscriptions_status_present", sql`length(${table.status}) between 1 and 40`),
    check("stripe_subscriptions_currency_known", sql`${table.currency} in ('EUR', 'USD', 'CHF')`),
    check("stripe_subscriptions_amount_positive", sql`${table.amount} > 0`),
    index("stripe_subscriptions_status_idx").on(table.status),
  ],
);
