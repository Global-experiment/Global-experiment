import { Inject, Injectable } from "@nestjs/common";
import { and, asc, eq, inArray, isNotNull, isNull, lte, ne, or, sql, type SQL } from "drizzle-orm";
import { zurichDate } from "../common/clock/clock.js";
import { APP_CONFIG } from "../common/config/config.module.js";
import type { AppConfig } from "../common/config/env.js";
import { DATABASE, type Database } from "../common/database/database.module.js";
import { SettingsService } from "../settings/settings.service.js";
import type { BalanceInfo, ChargeInfo, RefundInfo, SubscriptionInfo } from "../stripe/stripe.gateway.js";
import { stripeSubscriptions } from "../stripe/stripe.schema.js";
import { treasuryEntries, treasuryPublicEntries, type TreasuryCurrency } from "./treasury.schema.js";

export type Executor = Pick<Database, "select" | "insert" | "update" | "execute">;

/** Public wording of native Stripe entries (no donor data, ever). */
export const STRIPE_ENTRY_TEXT = {
  donationName: "Anonymous donation",
  donationDescription: "Anonymous donation",
  refundName: "Donation refund",
  refundDescription: "Refunded donation",
  disputeWithdrawnName: "Payment disputed",
  disputeWithdrawnDescription: "Payment disputed",
  disputeReinstatedName: "Dispute won",
  disputeReinstatedDescription: "Dispute won",
} as const;

/**
 * Which Stripe modes the public sees (data-model §4.1), as `livemode` values.
 * Production: live entries; also test-mode (sandbox) ones, marked Test, while
 * `treasury.show_test_donations` is on and the Stripe key is a test key
 * (before go-live). With a live key, only live entries, whatever the setting.
 * Elsewhere: the configured key's mode (test keys → test entries).
 * Non-Stripe entries are always real and always shown.
 */
export function publicStripeModes(config: AppConfig, showTestDonations: boolean): boolean[] {
  if (config.nodeEnv !== "production") return [config.stripe.livemode];
  return !config.stripe.livemode && showTestDonations ? [true, false] : [true];
}

/** The same rule for a setting read from the database. */
export async function readPublicStripeModes(config: AppConfig, settings: SettingsService): Promise<boolean[]> {
  return publicStripeModes(config, await settings.get("treasury.show_test_donations"));
}

export interface LedgerAmounts {
  feeAmount: number | null;
  netAmount: number | null;
  settlementCurrency: string | null;
  settlementGrossAmount: number | null;
  settlementFeeAmount: number | null;
  settlementNetAmount: number | null;
  exchangeRate: string | null;
}

const NO_AMOUNTS: LedgerAmounts = {
  feeAmount: null,
  netAmount: null,
  settlementCurrency: null,
  settlementGrossAmount: null,
  settlementFeeAmount: null,
  settlementNetAmount: null,
  exchangeRate: null,
};

/**
 * Fee and net from Stripe's balance transaction. Same currency: the fee and
 * net of the entry itself (net = gross − fee, as the database checks).
 * Settled in another currency: Stripe's figures are kept as settlement
 * columns with its exchange rate, never converted by us.
 */
export function amountsFromBalance(gross: number, currency: string, balance: BalanceInfo | null): LedgerAmounts {
  if (!balance) return NO_AMOUNTS;
  if (balance.currency === currency) return { ...NO_AMOUNTS, feeAmount: balance.fee, netAmount: gross - balance.fee };
  return {
    ...NO_AMOUNTS,
    settlementCurrency: balance.currency,
    settlementGrossAmount: balance.amount,
    settlementFeeAmount: balance.fee,
    settlementNetAmount: balance.amount - balance.fee,
    exchangeRate: balance.exchangeRate === null ? null : String(balance.exchangeRate),
  };
}

export interface RecordedEntry {
  entryId: string;
  created: boolean;
}

export interface DonationSummary {
  currency: TreasuryCurrency;
  /** Donations minus refunds and disputes, minor units (published entries of the public mode only). */
  totalDonated: number;
  /** Donations with money remaining: fully refunded or disputed ones don't count. */
  donationCount: number;
  /** Median of what remains of each donation (partial refunds count at their net remaining amount); null when there is none. */
  medianDonation: number | null;
  /** Active Stripe subscriptions in this currency and mode. */
  monthlyDonors: number;
  lastEntryAt: string | null;
}

const ON_CONFLICT = {
  target: [treasuryEntries.source, treasuryEntries.externalTransactionId],
  where: sql`${treasuryEntries.externalTransactionId} is not null`,
};

/**
 * The Treasury ledger as the donations module writes it: native Stripe
 * entries (published at once, review "Not required"), idempotent per Stripe
 * object id thanks to the unique (source, external_transaction_id), each
 * marked with the Stripe mode (test or live) it came from.
 */
@Injectable()
export class TreasuryLedgerRepository {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly settings: SettingsService,
  ) {}

  async findStripeEntry(executor: Executor, externalId: string): Promise<string | null> {
    const [row] = await executor
      .select({ id: treasuryEntries.id })
      .from(treasuryEntries)
      .where(and(eq(treasuryEntries.source, "stripe"), eq(treasuryEntries.externalTransactionId, externalId)))
      .limit(1);
    return row?.id ?? null;
  }

  private stripeColumns(livemode: boolean, now: Date) {
    return {
      managedBy: "native",
      source: "stripe",
      livemode,
      reviewStatusKey: "not_required",
      publicationStatus: "published",
      publishedAt: now,
    } as const;
  }

  private async insertOnce(executor: Executor, externalId: string, values: typeof treasuryEntries.$inferInsert): Promise<RecordedEntry> {
    const inserted = await executor.insert(treasuryEntries).values(values).onConflictDoNothing(ON_CONFLICT).returning({ id: treasuryEntries.id });
    if (inserted[0]) return { entryId: inserted[0].id, created: true };
    return { entryId: (await this.findStripeEntry(executor, externalId))!, created: false };
  }

  recordStripeDonation(
    executor: Executor,
    input: { charge: ChargeInfo; cadence: "one_off" | "monthly"; recurrenceId: string | null; livemode: boolean; now: Date },
  ): Promise<RecordedEntry> {
    const { charge } = input;
    return this.insertOnce(executor, charge.id, {
      ...this.stripeColumns(input.livemode, input.now),
      entryType: "donation",
      name: STRIPE_ENTRY_TEXT.donationName,
      currency: charge.currency,
      grossAmount: charge.amount,
      ...amountsFromBalance(charge.amount, charge.currency, charge.balance),
      cadence: input.cadence,
      externalTransactionId: charge.id,
      recurrenceId: input.recurrenceId,
      occurredOn: zurichDate(charge.created),
      occurredAt: charge.created,
      publicDescription: STRIPE_ENTRY_TEXT.donationDescription,
    });
  }

  recordStripeRefund(executor: Executor, input: { refund: RefundInfo; donationEntryId: string; livemode: boolean; now: Date }): Promise<RecordedEntry> {
    const { refund } = input;
    const gross = -refund.amount;
    return this.insertOnce(executor, refund.id, {
      ...this.stripeColumns(input.livemode, input.now),
      entryType: "refund",
      name: STRIPE_ENTRY_TEXT.refundName,
      currency: refund.currency,
      grossAmount: gross,
      ...amountsFromBalance(gross, refund.currency, refund.balance),
      cadence: "one_off",
      externalTransactionId: refund.id,
      adjustsEntryId: input.donationEntryId,
      occurredOn: zurichDate(refund.created),
      occurredAt: refund.created,
      publicDescription: STRIPE_ENTRY_TEXT.refundDescription,
    });
  }

  /**
   * A dispute's balance transaction as a dispute adjustment of the donation:
   * negative when Stripe withdraws the funds ("Payment disputed"), positive
   * when it reinstates them ("Dispute won"). One entry per balance
   * transaction (`txn_…`), so each is written once.
   */
  recordStripeDispute(
    executor: Executor,
    input: { transactionId: string; gross: number; currency: string; balance: BalanceInfo; created: Date; donationEntryId: string; livemode: boolean; now: Date },
  ): Promise<RecordedEntry> {
    const withdrawn = input.gross < 0;
    return this.insertOnce(executor, input.transactionId, {
      ...this.stripeColumns(input.livemode, input.now),
      entryType: "dispute",
      name: withdrawn ? STRIPE_ENTRY_TEXT.disputeWithdrawnName : STRIPE_ENTRY_TEXT.disputeReinstatedName,
      currency: input.currency,
      grossAmount: input.gross,
      ...amountsFromBalance(input.gross, input.currency, input.balance),
      cadence: "one_off",
      externalTransactionId: input.transactionId,
      adjustsEntryId: input.donationEntryId,
      occurredOn: zurichDate(input.created),
      occurredAt: input.created,
      publicDescription: withdrawn ? STRIPE_ENTRY_TEXT.disputeWithdrawnDescription : STRIPE_ENTRY_TEXT.disputeReinstatedDescription,
    });
  }

  async upsertSubscription(executor: Executor, subscription: SubscriptionInfo, livemode: boolean, now: Date): Promise<void> {
    const values = {
      status: subscription.status,
      currency: subscription.currency,
      amount: subscription.amount,
      startedAt: subscription.startedAt,
      canceledAt: subscription.canceledAt,
      updatedAt: now,
    };
    await executor
      .insert(stripeSubscriptions)
      .values({ id: subscription.id, livemode, ...values })
      .onConflictDoUpdate({ target: stripeSubscriptions.id, set: values });
  }

  /** Stripe entries whose fee Stripe hadn't reported yet (oldest first). */
  async entriesAwaitingFee(limit: number): Promise<{ id: string; entryType: string; externalId: string; grossAmount: number; currency: string }[]> {
    const rows = await this.db
      .select({
        id: treasuryEntries.id,
        entryType: treasuryEntries.entryType,
        externalId: treasuryEntries.externalTransactionId,
        grossAmount: treasuryEntries.grossAmount,
        currency: treasuryEntries.currency,
      })
      .from(treasuryEntries)
      .where(
        and(
          eq(treasuryEntries.source, "stripe"),
          // Disputes are written from their balance transaction: their amounts are always known.
          ne(treasuryEntries.entryType, "dispute"),
          isNull(treasuryEntries.feeAmount),
          isNull(treasuryEntries.settlementCurrency),
        ),
      )
      .orderBy(asc(treasuryEntries.createdAt))
      .limit(limit);
    return rows.filter((row): row is typeof row & { externalId: string } => row.externalId !== null);
  }

  /** Fills fee and net once — never overwrites amounts that are already known. */
  async applyAmounts(entryId: string, amounts: LedgerAmounts, now: Date): Promise<boolean> {
    if (amounts.feeAmount === null && amounts.settlementCurrency === null) return false;
    const updated = await this.db
      .update(treasuryEntries)
      .set({ ...amounts, updatedAt: now })
      .where(and(eq(treasuryEntries.id, entryId), isNull(treasuryEntries.feeAmount), isNull(treasuryEntries.settlementCurrency)))
      .returning({ id: treasuryEntries.id });
    return updated.length > 0;
  }

  /** Published entries of one currency that the public may see (Stripe rows of the public mode only). */
  private publicRows(currency: TreasuryCurrency, modes: boolean[]): SQL {
    const view = treasuryPublicEntries;
    return and(eq(view.currency, currency), or(ne(view.source, "stripe"), inArray(view.livemode, modes)))!;
  }

  /**
   * The donate page's figures, from the public view: each donation counts at
   * what remains after its refunds and dispute adjustments; one with nothing
   * left (fully refunded, or disputed and lost) isn't counted at all.
   * `asOf` ("YYYY-MM-DD"): the figures as they stood that day (entries that
   * occurred up to it), for the Treasury's trends.
   */
  async donationSummary(currency: TreasuryCurrency, asOf?: string): Promise<DonationSummary> {
    const view = treasuryPublicEntries;
    const modes = await readPublicStripeModes(this.config, this.settings);
    const visible = and(this.publicRows(currency, modes), asOf ? lte(view.occurredOn, asOf) : undefined)!;
    const adjustments = this.db
      .select({ donationId: view.adjustsEntryId, adjusted: sql<string>`sum(${view.grossAmount})`.as("adjusted") })
      .from(view)
      .where(and(visible, isNotNull(view.adjustsEntryId)))
      .groupBy(view.adjustsEntryId)
      .as("adjustments");
    const remaining = this.db
      .select({ remaining: sql<string>`${view.grossAmount} + coalesce(${adjustments.adjusted}, 0)`.as("remaining") })
      .from(view)
      .leftJoin(adjustments, eq(adjustments.donationId, view.id))
      .where(and(visible, eq(view.entryType, "donation")))
      .as("remaining_by_donation");
    const [totals] = await this.db
      .select({
        total: sql<string>`coalesce(sum(greatest(${remaining.remaining}, 0)), 0)`,
        donations: sql<number>`(count(*) filter (where ${remaining.remaining} > 0))::int`,
        median: sql<string | null>`percentile_cont(0.5) within group (order by ${remaining.remaining}) filter (where ${remaining.remaining} > 0)`,
      })
      .from(remaining);
    const [latest] = await this.db
      .select({ at: sql<Date | string | null>`max(${view.publishedAt})` })
      .from(view)
      .where(visible);
    const [donors] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(stripeSubscriptions)
      .where(
        and(
          eq(stripeSubscriptions.status, "active"),
          eq(stripeSubscriptions.currency, currency),
          inArray(stripeSubscriptions.livemode, modes),
        ),
      );
    const lastEntry = latest?.at ?? null;
    return {
      currency,
      totalDonated: Number(totals?.total ?? 0),
      donationCount: Number(totals?.donations ?? 0),
      medianDonation: totals?.median === null || totals?.median === undefined ? null : Math.round(Number(totals.median)),
      monthlyDonors: donors?.count ?? 0,
      lastEntryAt: lastEntry === null ? null : new Date(lastEntry).toISOString(),
    };
  }
}
