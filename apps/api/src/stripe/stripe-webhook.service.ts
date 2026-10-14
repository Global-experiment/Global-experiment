import { Inject, Injectable } from "@nestjs/common";
import { PinoLogger } from "nestjs-pino";
import { CLOCK, type Clock } from "../common/clock/clock.js";
import { APP_CONFIG } from "../common/config/config.module.js";
import type { AppConfig } from "../common/config/env.js";
import { DATABASE, type Database } from "../common/database/database.module.js";
import { ApiError } from "../common/errors/api-error.js";
import { PUBLIC_CACHE_TAGS, RevalidationService } from "../revalidation/revalidation.service.js";
import { TreasuryLedgerRepository, type Executor } from "../treasury/treasury-ledger.repository.js";
import { TREASURY_CURRENCIES } from "../treasury/treasury.schema.js";
import { StripeEventsRepository } from "./stripe-events.repository.js";
import {
  STRIPE_GATEWAY,
  type ChargeInfo,
  type DisputeInfo,
  type RefundInfo,
  type StripeEventInfo,
  type StripeGateway,
  type SubscriptionInfo,
} from "./stripe.gateway.js";

export type WebhookResult = "processed" | "ignored" | "duplicate";

/**
 * Something Stripe hasn't finished yet (e.g. the charge, or the donation a
 * refund belongs to, isn't there): the delivery fails with a 409 and Stripe
 * retries it later. An expected condition, not an internal error.
 */
export class RetryLaterError extends ApiError {
  constructor(readonly reason: string) {
    super("conflict", "Not ready yet; Stripe will retry.", { reason });
    this.name = "RetryLaterError";
  }
}

const failureCode = (error: unknown) =>
  error instanceof RetryLaterError ? `retry:${error.reason}` : `error:${error instanceof Error ? error.name : "unknown"}`;

type Plan =
  | { kind: "ignore"; reason: string }
  | { kind: "donation"; charge: ChargeInfo; cadence: "one_off" | "monthly"; subscription: SubscriptionInfo | null }
  | { kind: "subscription"; subscription: SubscriptionInfo }
  | { kind: "refunds"; charge: ChargeInfo; refunds: RefundInfo[] }
  | { kind: "dispute"; charge: ChargeInfo; dispute: DisputeInfo; direction: "withdrawn" | "reinstated" };

/**
 * The ledger keeps EUR, USD and CHF only (decided 2026-10-15; Checkout sessions
 * disable Adaptive Pricing). Anything else is refused visibly — recorded on the
 * event as retry:unsupported_currency, retried by Stripe — never written.
 */
function assertLedgerCurrency(plan: Plan): void {
  const currencies =
    plan.kind === "donation"
      ? [plan.charge.currency, plan.subscription?.currency]
      : plan.kind === "subscription"
        ? [plan.subscription.currency]
        : plan.kind === "refunds"
          ? [plan.charge.currency]
          : plan.kind === "dispute"
            ? [plan.charge.currency, plan.dispute.currency]
            : [];
  for (const currency of currencies) {
    if (currency !== undefined && !(TREASURY_CURRENCIES as readonly string[]).includes(currency)) throw new RetryLaterError("unsupported_currency");
  }
}

export const HANDLED_EVENT_TYPES = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "invoice.paid",
  "charge.refunded",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "charge.dispute.funds_withdrawn",
  "charge.dispute.funds_reinstated",
] as const;

/**
 * Turns Stripe webhook events into native Treasury entries, exactly once
 * (docs/architecture/data-model.md §4.4):
 *
 * 1. the event is recorded in `stripe_events` (a known id is a duplicate);
 * 2. the current state is fetched from Stripe — never trusted from the
 *    payload, so late or out-of-order events are harmless;
 * 3. one transaction locks the event row, writes the ledger and marks the
 *    event processed. The unique (source, external id) on entries is the
 *    second guard: a charge or refund can only ever produce one entry.
 *
 * Every successful payment becomes a published, anonymous donation; every
 * Stripe refund a negative refund entry linked to it (decided 2026-10-15);
 * a dispute's withdrawal a negative and its reinstatement a positive dispute
 * adjustment linked to it. Every entry carries the event's Stripe mode.
 */
@Injectable()
export class StripeWebhookService {
  constructor(
    @Inject(STRIPE_GATEWAY) private readonly stripe: StripeGateway,
    @Inject(DATABASE) private readonly db: Database,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly events: StripeEventsRepository,
    private readonly ledger: TreasuryLedgerRepository,
    private readonly revalidation: RevalidationService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(StripeWebhookService.name);
  }

  async handle(event: StripeEventInfo): Promise<WebhookResult> {
    const status = await this.events.receive(event);
    if (status === "processed" || status === "ignored") {
      this.logger.info({ eventId: event.id, eventType: event.type, result: "duplicate" }, "Stripe event handled");
      return "duplicate";
    }

    let plan: Plan;
    try {
      plan = event.livemode !== this.config.stripe.livemode ? { kind: "ignore", reason: "other_mode" } : await this.prepare(event);
      assertLedgerCurrency(plan);
    } catch (error) {
      await this.events.fail(event.id, failureCode(error));
      throw error;
    }

    const outcome = await this.db
      .transaction(async (tx) => {
      const current = await this.events.lock(tx, event.id);
      if (current === "processed" || current === "ignored") return { result: "duplicate" as const, wrote: false };
      if (plan.kind === "ignore") {
        await this.events.finish(tx, event.id, "ignored", null, this.clock());
        return { result: "ignored" as const, wrote: false, reason: plan.reason };
      }
      const { entryId, wrote } = await this.apply(tx, plan, event.livemode);
      await this.events.finish(tx, event.id, "processed", entryId, this.clock());
      return { result: "processed" as const, wrote };
    })
      .catch(async (error: unknown) => {
        // Rolled back: nothing was written; record the failed attempt, Stripe retries.
        await this.events.fail(event.id, failureCode(error));
        throw error;
      });

    this.logger.info(
      { eventId: event.id, eventType: event.type, result: outcome.result, ...("reason" in outcome ? { reason: outcome.reason } : {}) },
      "Stripe event handled",
    );
    if (outcome.wrote) await this.revalidation.revalidate([PUBLIC_CACHE_TAGS.treasury]);
    return outcome.result;
  }

  /** Network reads only (outside the transaction): what this event means for the ledger. */
  private async prepare(event: StripeEventInfo): Promise<Plan> {
    if (!(HANDLED_EVENT_TYPES as readonly string[]).includes(event.type)) return { kind: "ignore", reason: "unhandled_type" };
    if (!event.objectId) return { kind: "ignore", reason: "no_object" };

    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = await this.stripe.getCheckoutSession(event.objectId);
        if (!session.donation) return { kind: "ignore", reason: "not_a_donation" };
        if (session.mode === "subscription") {
          // The charges arrive as invoice.paid; here only the subscription is recorded.
          if (!session.subscriptionId) return { kind: "ignore", reason: "no_subscription" };
          return { kind: "subscription", subscription: await this.stripe.getSubscription(session.subscriptionId) };
        }
        if (session.mode !== "payment") return { kind: "ignore", reason: "unsupported_mode" };
        // Delayed methods (SEPA) complete "unpaid"; their async_payment_succeeded follows.
        if (session.paymentStatus !== "paid") return { kind: "ignore", reason: "payment_pending" };
        if (!session.paymentIntentId) throw new RetryLaterError("no_payment_intent");
        const charge = await this.stripe.getPaymentIntentCharge(session.paymentIntentId);
        if (!charge || charge.status !== "succeeded") throw new RetryLaterError("charge_not_ready");
        return { kind: "donation", charge: { ...charge, donation: true }, cadence: "one_off", subscription: null };
      }
      case "invoice.paid": {
        const invoice = await this.stripe.getInvoiceCharge(event.objectId);
        if (!invoice.donation) return { kind: "ignore", reason: "not_a_donation" };
        if (!invoice.charge) return { kind: "ignore", reason: "nothing_paid" };
        if (invoice.charge.status !== "succeeded") throw new RetryLaterError("charge_not_ready");
        const subscription = invoice.subscriptionId ? await this.stripe.getSubscription(invoice.subscriptionId) : null;
        return { kind: "donation", charge: invoice.charge, cadence: subscription ? "monthly" : "one_off", subscription };
      }
      case "charge.refunded": {
        const charge = await this.stripe.getCharge(event.objectId);
        const refunds = await this.stripe.listRefunds(charge.id);
        return { kind: "refunds", charge, refunds };
      }
      case "charge.dispute.funds_withdrawn":
      case "charge.dispute.funds_reinstated": {
        const dispute = await this.stripe.getDispute(event.objectId);
        const charge = await this.stripe.getCharge(dispute.chargeId);
        return { kind: "dispute", charge, dispute, direction: event.type.endsWith("withdrawn") ? "withdrawn" : "reinstated" };
      }
      default: {
        // customer.subscription.created / updated / deleted
        const subscription = await this.stripe.getSubscription(event.objectId);
        if (!subscription.donation) return { kind: "ignore", reason: "not_a_donation" };
        return { kind: "subscription", subscription };
      }
    }
  }

  /**
   * The donation a refund or dispute adjusts. When that event arrives before
   * the payment's own, the donation is recorded now if the charge is clearly
   * ours; otherwise the delivery waits (Stripe retries).
   */
  private async donationFor(tx: Executor, charge: ChargeInfo, livemode: boolean, now: Date): Promise<string> {
    const existing = await this.ledger.findStripeEntry(tx, charge.id);
    if (existing) return existing;
    if (!charge.donation || charge.status !== "succeeded") throw new RetryLaterError("donation_not_recorded");
    return (await this.ledger.recordStripeDonation(tx, { charge, cadence: "one_off", recurrenceId: null, livemode, now })).entryId;
  }

  /** Ledger writes, inside the event's transaction. */
  private async apply(tx: Executor, plan: Exclude<Plan, { kind: "ignore" }>, livemode: boolean): Promise<{ entryId: string | null; wrote: boolean }> {
    const now = this.clock();
    switch (plan.kind) {
      case "subscription":
        await this.ledger.upsertSubscription(tx, plan.subscription, livemode, now);
        // "Monthly donors" changed.
        return { entryId: null, wrote: true };
      case "donation": {
        if (plan.subscription) await this.ledger.upsertSubscription(tx, plan.subscription, livemode, now);
        const recorded = await this.ledger.recordStripeDonation(tx, {
          charge: plan.charge,
          cadence: plan.cadence,
          recurrenceId: plan.subscription?.id ?? null,
          livemode,
          now,
        });
        return { entryId: recorded.entryId, wrote: recorded.created || plan.subscription !== null };
      }
      case "refunds": {
        const donationId = await this.donationFor(tx, plan.charge, livemode, now);
        let last: string | null = null;
        let wrote = false;
        for (const refund of plan.refunds.filter((candidate) => candidate.status === "succeeded")) {
          const recorded = await this.ledger.recordStripeRefund(tx, { refund, donationEntryId: donationId, livemode, now });
          last = recorded.entryId;
          wrote ||= recorded.created;
        }
        return { entryId: last, wrote };
      }
      case "dispute": {
        const donationId = await this.donationFor(tx, plan.charge, livemode, now);
        const { dispute } = plan;
        // The withdrawal is the negative balance transaction, the reinstatement the positive one.
        const transactions = dispute.balanceTransactions.filter((transaction) => (plan.direction === "withdrawn" ? transaction.amount < 0 : transaction.amount > 0));
        if (transactions.length === 0) throw new RetryLaterError("dispute_not_settled");
        let last: string | null = null;
        let wrote = false;
        for (const transaction of transactions) {
          const sign = transaction.amount < 0 ? -1 : 1;
          // In the donation's currency: Stripe's own amount when it settled in it, else the disputed amount.
          const gross = transaction.currency === dispute.currency ? transaction.amount : sign * dispute.amount;
          const recorded = await this.ledger.recordStripeDispute(tx, {
            transactionId: transaction.id,
            gross,
            currency: dispute.currency,
            balance: transaction,
            created: transaction.created,
            donationEntryId: donationId,
            livemode,
            now,
          });
          last = recorded.entryId;
          wrote ||= recorded.created;
        }
        return { entryId: last, wrote };
      }
    }
  }
}
