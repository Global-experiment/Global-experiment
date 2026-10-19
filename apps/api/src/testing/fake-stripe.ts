import Stripe from "stripe";
import { verifyStripeEvent } from "../stripe/stripe-sdk.gateway.js";
import type {
  BalanceInfo,
  ChargeInfo,
  CheckoutSessionInfo,
  CreateCheckoutSessionInput,
  CreatePaymentIntentInput,
  DisputeInfo,
  InvoiceChargeInfo,
  PaymentIntentInfo,
  RefundInfo,
  StripeEventInfo,
  StripeGateway,
  SubscriptionInfo,
} from "../stripe/stripe.gateway.js";

/**
 * A Stripe test double for the API tests (test files only — never wired
 * outside tests): an in-memory account of sessions, charges, refunds,
 * invoices and subscriptions, and a record of every Checkout session the
 * API asked for. Signatures are verified with Stripe's real code, and
 * deliveries are signed with Stripe's own test-signature helper.
 */
export const FAKE_WEBHOOK_SECRET = "whsec_testsecretfortheapitestsonly0123456789";

const signer = new Stripe("sk_test_signing_only_never_used_for_calls");

let counter = 0;
const next = (prefix: string) => `${prefix}_${String(++counter).padStart(8, "0")}test`;

/** Stripe's standard card pricing in tests: 2.9% + 30 (minor units). */
export const cardFee = (amount: number) => Math.round(amount * 0.029) + 30;

export class FakeStripe implements StripeGateway {
  readonly createdSessions: (CreateCheckoutSessionInput & { id: string })[] = [];
  readonly createdIntents: (CreatePaymentIntentInput & { id: string })[] = [];
  /** PaymentIntent id → what getPaymentIntent returns (embedded donations and others). */
  readonly intentInfos = new Map<string, PaymentIntentInfo>();
  readonly sessions = new Map<string, CheckoutSessionInfo>();
  readonly charges = new Map<string, ChargeInfo>();
  /** PaymentIntent id → charge id (null while the charge isn't there yet). */
  readonly intents = new Map<string, string | null>();
  readonly refunds = new Map<string, RefundInfo & { chargeId: string }>();
  readonly invoices = new Map<string, InvoiceChargeInfo>();
  readonly subscriptions = new Map<string, SubscriptionInfo>();
  readonly disputes = new Map<string, DisputeInfo>();
  /** Calls per method, to assert what the webhook fetched. */
  readonly calls: string[] = [];
  /** When set, Checkout session creation fails as Stripe being down would. */
  unavailable: Error | null = null;

  constructEvent(rawBody: Buffer, signatureHeader: string): StripeEventInfo {
    return verifyStripeEvent(signer, rawBody, signatureHeader, FAKE_WEBHOOK_SECRET);
  }

  async createCheckoutSession(input: CreateCheckoutSessionInput) {
    this.calls.push("createCheckoutSession");
    if (this.unavailable) throw this.unavailable;
    // Stripe's idempotency: the same key returns the same session.
    const existing = this.createdSessions.find((session) => session.idempotencyKey === input.idempotencyKey);
    if (existing) return { id: existing.id, url: `https://checkout.stripe.com/c/pay/${existing.id}` };
    const id = `cs_test_${String(++counter).padStart(12, "0")}`;
    this.createdSessions.push({ ...input, id });
    return { id, url: `https://checkout.stripe.com/c/pay/${id}` };
  }

  async getCheckoutSession(id: string) {
    this.calls.push("getCheckoutSession");
    const session = this.sessions.get(id);
    if (!session) throw new Stripe.errors.StripeInvalidRequestError({ message: "No such checkout session", type: "invalid_request_error" });
    return session;
  }

  async createPaymentIntent(input: CreatePaymentIntentInput) {
    this.calls.push("createPaymentIntent");
    if (this.unavailable) throw this.unavailable;
    const existing = this.createdIntents.find((intent) => intent.idempotencyKey === input.idempotencyKey);
    const id = existing?.id ?? next("pi");
    if (!existing) {
      this.createdIntents.push({ ...input, id });
      this.intentInfos.set(id, { id, status: "requires_payment_method", amount: input.amount, currency: input.currency, donation: true, embedded: true });
    }
    return { id, clientSecret: `${id}_secret_fake` };
  }

  async getPaymentIntent(id: string) {
    this.calls.push("getPaymentIntent");
    const intent = this.intentInfos.get(id);
    if (!intent) throw new Stripe.errors.StripeInvalidRequestError({ message: "No such payment_intent", type: "invalid_request_error" });
    return intent;
  }

  async getPaymentIntentCharge(paymentIntentId: string) {
    this.calls.push("getPaymentIntentCharge");
    const chargeId = this.intents.get(paymentIntentId);
    return chargeId ? this.charges.get(chargeId)! : null;
  }

  async getCharge(chargeId: string) {
    this.calls.push("getCharge");
    return this.charges.get(chargeId)!;
  }

  async listRefunds(chargeId: string) {
    this.calls.push("listRefunds");
    return [...this.refunds.values()].filter((refund) => refund.chargeId === chargeId);
  }

  async getRefund(refundId: string) {
    this.calls.push("getRefund");
    return this.refunds.get(refundId)!;
  }

  async getInvoiceCharge(invoiceId: string) {
    this.calls.push("getInvoiceCharge");
    return this.invoices.get(invoiceId)!;
  }

  async getSubscription(subscriptionId: string) {
    this.calls.push("getSubscription");
    return this.subscriptions.get(subscriptionId)!;
  }

  async getDispute(disputeId: string) {
    this.calls.push("getDispute");
    return this.disputes.get(disputeId)!;
  }

  // ---- Scenario builders (what Stripe would hold after a donor paid) ----

  balance(currency: string, amount: number, fee = cardFee(Math.abs(amount))): BalanceInfo {
    return { currency, amount, fee, net: amount - fee, exchangeRate: null };
  }

  /** A completed one-off donation Checkout with its succeeded charge. */
  oneOffDonation(currency: string, amount: number, options: { settled?: boolean; donation?: boolean; paid?: boolean } = {}) {
    const chargeId = next("ch");
    const intentId = next("pi");
    const sessionId = `cs_test_${String(++counter).padStart(12, "0")}`;
    const donation = options.donation ?? true;
    this.charges.set(chargeId, {
      id: chargeId,
      amount,
      currency,
      created: new Date("2026-10-15T09:30:00Z"),
      status: options.paid === false ? "pending" : "succeeded",
      donation,
      balance: options.settled === false ? null : this.balance(currency, amount),
    });
    this.intents.set(intentId, chargeId);
    // Checkout's own PaymentIntent: not embedded (recorded from checkout.session.completed).
    this.intentInfos.set(intentId, { id: intentId, status: options.paid === false ? "processing" : "succeeded", amount, currency, donation, embedded: false });
    this.sessions.set(sessionId, {
      id: sessionId,
      mode: "payment",
      status: "complete",
      paymentStatus: options.paid === false ? "unpaid" : "paid",
      paymentIntentId: intentId,
      subscriptionId: null,
      donation,
    });
    return { sessionId, chargeId, intentId };
  }

  /** A one-off card donation paid on the donate page (embedded card fields): PaymentIntent + its charge. */
  embeddedDonation(currency: string, amount: number, options: { donation?: boolean; paid?: boolean } = {}) {
    const chargeId = next("ch");
    const intentId = next("pi");
    const donation = options.donation ?? true;
    this.charges.set(chargeId, {
      id: chargeId,
      amount,
      currency,
      created: new Date("2026-10-19T09:30:00Z"),
      status: options.paid === false ? "pending" : "succeeded",
      donation,
      balance: this.balance(currency, amount),
    });
    this.intents.set(intentId, chargeId);
    this.intentInfos.set(intentId, { id: intentId, status: options.paid === false ? "processing" : "succeeded", amount, currency, donation, embedded: true });
    return { chargeId, intentId };
  }

  /** A monthly donation: subscription + its first paid invoice. */
  monthlyDonation(currency: string, amount: number) {
    const subscriptionId = next("sub");
    const sessionId = `cs_test_${String(++counter).padStart(12, "0")}`;
    this.subscriptions.set(subscriptionId, {
      id: subscriptionId,
      status: "active",
      currency,
      amount,
      startedAt: new Date("2026-10-15T09:30:00Z"),
      canceledAt: null,
      donation: true,
    });
    this.sessions.set(sessionId, {
      id: sessionId,
      mode: "subscription",
      status: "complete",
      paymentStatus: "paid",
      paymentIntentId: null,
      subscriptionId,
      donation: true,
    });
    return { sessionId, subscriptionId, invoiceId: this.monthlyCharge(subscriptionId).invoiceId };
  }

  /** One more paid invoice of a subscription (next month). */
  monthlyCharge(subscriptionId: string) {
    const subscription = this.subscriptions.get(subscriptionId)!;
    const chargeId = next("ch");
    const invoiceId = next("in");
    const charge: ChargeInfo = {
      id: chargeId,
      amount: subscription.amount,
      currency: subscription.currency,
      created: new Date("2026-10-15T09:31:00Z"),
      status: "succeeded",
      // A subscription's PaymentIntent carries no metadata; the invoice says it's ours.
      donation: false,
      balance: this.balance(subscription.currency, subscription.amount),
    };
    this.charges.set(chargeId, charge);
    this.invoices.set(invoiceId, { donation: true, subscriptionId, charge: { ...charge, donation: true } });
    return { invoiceId, chargeId };
  }

  /** A dispute on a charge, with Stripe's withdrawal (amount and the dispute fee, in `settle` currency when given). */
  dispute(chargeId: string, amount: number, options: { fee?: number; settle?: { currency: string; amount: number; exchangeRate: number } } = {}) {
    const charge = this.charges.get(chargeId)!;
    const id = next("dp");
    const fee = options.fee ?? 1500;
    const settled = options.settle;
    this.disputes.set(id, {
      id,
      chargeId,
      amount,
      currency: charge.currency,
      status: "needs_response",
      balanceTransactions: [
        {
          id: next("txn"),
          created: new Date("2026-10-20T08:00:00Z"),
          currency: settled?.currency ?? charge.currency,
          amount: -(settled?.amount ?? amount),
          fee,
          net: -(settled?.amount ?? amount) - fee,
          exchangeRate: settled?.exchangeRate ?? null,
        },
      ],
    });
    return id;
  }

  /** The dispute is won: Stripe reinstates the funds (and, here, gives the fee back). */
  winDispute(disputeId: string, options: { feeReturned?: boolean } = {}) {
    const dispute = this.disputes.get(disputeId)!;
    const withdrawal = dispute.balanceTransactions[0]!;
    const fee = options.feeReturned === false ? 0 : -withdrawal.fee;
    dispute.status = "won";
    dispute.balanceTransactions.push({
      id: next("txn"),
      created: new Date("2026-11-20T08:00:00Z"),
      currency: withdrawal.currency,
      amount: -withdrawal.amount,
      fee,
      net: -withdrawal.amount - fee,
      exchangeRate: withdrawal.exchangeRate,
    });
  }

  refund(chargeId: string, amount: number, status = "succeeded") {
    const charge = this.charges.get(chargeId)!;
    const id = next("re");
    this.refunds.set(id, {
      id,
      chargeId,
      amount,
      currency: charge.currency,
      created: new Date("2026-10-16T10:00:00Z"),
      status,
      balance: { currency: charge.currency, amount: -amount, fee: 0, net: -amount, exchangeRate: null },
    });
    return id;
  }
}

/** A signed webhook delivery, as Stripe sends it. */
export function signedEvent(type: string, objectId: string, options: { id?: string; livemode?: boolean; secret?: string } = {}) {
  const payload = JSON.stringify({
    id: options.id ?? next("evt"),
    object: "event",
    type,
    livemode: options.livemode ?? false,
    created: Math.floor(Date.now() / 1000),
    api_version: "2026-08-26.dahlia",
    data: { object: { id: objectId } },
  });
  const header = signer.webhooks.generateTestHeaderString({ payload, secret: options.secret ?? FAKE_WEBHOOK_SECRET });
  return { payload, header, id: (JSON.parse(payload) as { id: string }).id };
}
