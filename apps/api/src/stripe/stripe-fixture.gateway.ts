import { NotFoundError } from "../common/errors/api-error.js";
import {
  StripeSignatureError,
  type ChargeInfo,
  type CheckoutSessionInfo,
  type CreateCheckoutSessionInput,
  type CreatePaymentIntentInput,
  type DisputeInfo,
  type InvoiceChargeInfo,
  type PaymentIntentInfo,
  type RefundInfo,
  type StripeEventInfo,
  type StripeGateway,
  type SubscriptionInfo,
} from "./stripe.gateway.js";

/**
 * Scripted Checkout sessions for the Playwright suite (STRIPE_FIXTURE=1,
 * accepted only under NODE_ENV=test — env.ts refuses it anywhere else). The
 * browser tests intercept the redirect to checkout.stripe.com; the thank-you
 * page checks these well-known session ids. It never talks to Stripe and
 * accepts no webhook (every signature is refused); real Stripe is covered by
 * the manual test-mode run (docs/operations/stripe.md).
 */
export const FIXTURE_SESSIONS: Record<string, Pick<CheckoutSessionInfo, "mode" | "status" | "paymentStatus">> = {
  cs_test_e2ecompletepaid0001: { mode: "payment", status: "complete", paymentStatus: "paid" },
  cs_test_e2ecompletemonthly01: { mode: "subscription", status: "complete", paymentStatus: "paid" },
  cs_test_e2ecompletepending01: { mode: "payment", status: "complete", paymentStatus: "unpaid" },
  cs_test_e2eopensession00001: { mode: "payment", status: "open", paymentStatus: "unpaid" },
};

/** Embedded card donations the thank-you page knows (status only; the browser tests stub Stripe.js). */
export const FIXTURE_INTENTS: Record<string, Pick<PaymentIntentInfo, "status" | "amount" | "currency">> = {
  pi_e2esucceeded000000001: { status: "succeeded", amount: 2000, currency: "USD" },
  pi_e2eprocessing00000001: { status: "processing", amount: 2000, currency: "USD" },
  pi_e2efailed000000000001: { status: "requires_payment_method", amount: 2000, currency: "USD" },
};

export class FixtureStripeGateway implements StripeGateway {
  private created = 0;

  constructEvent(): StripeEventInfo {
    throw new StripeSignatureError();
  }

  async createCheckoutSession(input: CreateCheckoutSessionInput): Promise<{ id: string; url: string }> {
    const id = `cs_test_e2ecreated${String(++this.created).padStart(8, "0")}`;
    const query = new URLSearchParams({ mode: input.mode, currency: input.currency, amount: String(input.amount), methods: input.paymentMethodTypes.join(",") });
    return { id, url: `https://checkout.stripe.com/c/pay/${id}?${query.toString()}` };
  }

  async createPaymentIntent(input: CreatePaymentIntentInput): Promise<{ id: string; clientSecret: string }> {
    const id = `pi_e2ecreated${String(++this.created).padStart(8, "0")}`;
    return { id, clientSecret: `${id}_secret_e2e${input.currency}${input.amount}` };
  }

  async getPaymentIntent(id: string): Promise<PaymentIntentInfo> {
    const intent = FIXTURE_INTENTS[id];
    if (!intent) throw new NotFoundError("Payment not found.");
    return { id, ...intent, donation: true, embedded: true };
  }

  async getCheckoutSession(id: string): Promise<CheckoutSessionInfo> {
    const session = FIXTURE_SESSIONS[id];
    if (!session) throw new NotFoundError("Checkout session not found.");
    return { id, ...session, paymentIntentId: null, subscriptionId: null, donation: true };
  }

  private none(): never {
    throw new NotFoundError("Not available in the Stripe fixture.");
  }
  getPaymentIntentCharge(): Promise<ChargeInfo | null> {
    return this.none();
  }
  getCharge(): Promise<ChargeInfo> {
    return this.none();
  }
  listRefunds(): Promise<RefundInfo[]> {
    return this.none();
  }
  getRefund(): Promise<RefundInfo> {
    return this.none();
  }
  getInvoiceCharge(): Promise<InvoiceChargeInfo> {
    return this.none();
  }
  getSubscription(): Promise<SubscriptionInfo> {
    return this.none();
  }
  getDispute(): Promise<DisputeInfo> {
    return this.none();
  }
}
