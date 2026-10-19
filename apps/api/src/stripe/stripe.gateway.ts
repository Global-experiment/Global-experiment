/**
 * Everything the donations module needs from Stripe, as plain data. The
 * SDK adapter (stripe-sdk.gateway.ts) is the only file that imports the
 * Stripe SDK; tests replace it with a test double. Amounts are in minor
 * units; currencies upper-case; ids as Stripe issues them.
 */

export const STRIPE_GATEWAY = Symbol("STRIPE_GATEWAY");

/** Marks every object the experiment creates, so unrelated payments on the account are ignored. */
export const DONATION_METADATA = { kind: "donation" } as const;

export type CheckoutMethod = "card" | "paypal" | "sepa_debit";

export interface CreateCheckoutSessionInput {
  mode: "payment" | "subscription";
  currency: string;
  /** Minor units. */
  amount: number;
  paymentMethodTypes: CheckoutMethod[];
  productName: string;
  successUrl: string;
  cancelUrl: string;
  idempotencyKey: string;
}

/** A one-off card donation paid on the donate page itself (Payment Element; decided 2026-10-19). */
export interface CreatePaymentIntentInput {
  currency: string;
  /** Minor units. */
  amount: number;
  description: string;
  idempotencyKey: string;
}

/** Marks a PaymentIntent the donate page created itself (the webhook records it from payment_intent.succeeded). */
export const EMBEDDED_FLOW = "embedded";

export interface PaymentIntentInfo {
  id: string;
  /** "requires_payment_method", "requires_action", "processing", "succeeded", "canceled", … */
  status: string;
  amount: number;
  currency: string;
  /** Created by the donate flow. */
  donation: boolean;
  /** Created for the embedded card form (not by a Checkout session). */
  embedded: boolean;
}

/** Stripe's balance transaction: what the payment or refund settled as, fees included. */
export interface BalanceInfo {
  currency: string;
  amount: number;
  fee: number;
  net: number;
  /** Set when the settlement currency differs from the payment's. */
  exchangeRate: number | null;
}

export interface ChargeInfo {
  id: string;
  /** Minor units, in `currency`. */
  amount: number;
  currency: string;
  created: Date;
  /** Stripe's status: "succeeded", "pending" or "failed" (open-ended for future values). */
  status: string;
  /** Created by the donate flow (our metadata on the PaymentIntent or the subscription). */
  donation: boolean;
  /** Null until Stripe has settled the charge (some methods settle later). */
  balance: BalanceInfo | null;
}

export interface RefundInfo {
  id: string;
  /** Minor units, positive (the amount given back). */
  amount: number;
  currency: string;
  created: Date;
  /** "succeeded", "pending", "failed", "canceled" or "requires_action". */
  status: string;
  balance: BalanceInfo | null;
}

export interface CheckoutSessionInfo {
  id: string;
  /** "payment", "subscription" or "setup". */
  mode: string;
  /** "open", "complete" or "expired". */
  status: string | null;
  /** "paid", "unpaid" or "no_payment_required". */
  paymentStatus: string;
  paymentIntentId: string | null;
  subscriptionId: string | null;
  donation: boolean;
}

export interface SubscriptionInfo {
  id: string;
  status: string;
  currency: string;
  /** Monthly amount, minor units. */
  amount: number;
  startedAt: Date;
  canceledAt: Date | null;
  donation: boolean;
}

export interface InvoiceChargeInfo {
  donation: boolean;
  subscriptionId: string | null;
  /** The paid charge, or null for a zero-amount invoice. */
  charge: ChargeInfo | null;
}

/** A balance transaction of a dispute: the withdrawal (amount < 0) or the reinstatement (amount > 0). */
export interface DisputeBalanceInfo extends BalanceInfo {
  id: string;
  created: Date;
}

export interface DisputeInfo {
  id: string;
  chargeId: string;
  /** Disputed amount, minor units, positive, in `currency` (the charge's). */
  amount: number;
  currency: string;
  /** Stripe's status: "needs_response", "under_review", "won", "lost", … */
  status: string;
  /** In Stripe's account (settlement) currency. */
  balanceTransactions: DisputeBalanceInfo[];
}

export interface StripeEventInfo {
  id: string;
  type: string;
  livemode: boolean;
  created: Date;
  /** The id of the event's object (session, invoice, charge, subscription). */
  objectId: string | null;
}

export class StripeSignatureError extends Error {
  constructor() {
    super("Invalid Stripe signature.");
    this.name = "StripeSignatureError";
  }
}

export interface StripeGateway {
  /** Verifies the signature over the raw body; throws StripeSignatureError. */
  constructEvent(rawBody: Buffer, signatureHeader: string): StripeEventInfo;
  createCheckoutSession(input: CreateCheckoutSessionInput): Promise<{ id: string; url: string }>;
  getCheckoutSession(id: string): Promise<CheckoutSessionInfo>;
  /** Card only, tagged as an embedded donation; the browser confirms it with the client secret. */
  createPaymentIntent(input: CreatePaymentIntentInput): Promise<{ id: string; clientSecret: string }>;
  getPaymentIntent(id: string): Promise<PaymentIntentInfo>;
  /** The PaymentIntent's latest charge, or null if it has none yet. */
  getPaymentIntentCharge(paymentIntentId: string): Promise<ChargeInfo | null>;
  getCharge(chargeId: string): Promise<ChargeInfo>;
  listRefunds(chargeId: string): Promise<RefundInfo[]>;
  getRefund(refundId: string): Promise<RefundInfo>;
  getInvoiceCharge(invoiceId: string): Promise<InvoiceChargeInfo>;
  getSubscription(subscriptionId: string): Promise<SubscriptionInfo>;
  getDispute(disputeId: string): Promise<DisputeInfo>;
}
