import Stripe from "stripe";
import { ProviderUnavailableError, ValidationFailedError } from "../common/errors/api-error.js";
import {
  DONATION_METADATA,
  EMBEDDED_FLOW,
  StripeSignatureError,
  type BalanceInfo,
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

const isDonation = (metadata: Stripe.Metadata | null | undefined) => metadata?.kind === DONATION_METADATA.kind;
const at = (seconds: number) => new Date(seconds * 1000);
const idOf = (value: string | { id: string } | null | undefined) => (value === null || value === undefined ? null : typeof value === "string" ? value : value.id);

function balanceOf(value: string | Stripe.BalanceTransaction | null): BalanceInfo | null {
  if (!value || typeof value === "string") return null;
  return {
    currency: value.currency.toUpperCase(),
    amount: value.amount,
    fee: value.fee,
    net: value.net,
    exchangeRate: value.exchange_rate ?? null,
  };
}

/**
 * Verifies a webhook delivery with Stripe's own signature check (HMAC over
 * the raw body, timestamp tolerance 5 minutes) — no network call. Shared
 * with the tests' Stripe double so they exercise the real verification.
 */
export function verifyStripeEvent(stripe: Stripe, rawBody: Buffer, signatureHeader: string, secret: string | undefined): StripeEventInfo {
  if (!secret) throw new StripeSignatureError();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signatureHeader, secret);
  } catch {
    throw new StripeSignatureError();
  }
  const object = event.data.object as { id?: unknown };
  return {
    id: event.id,
    type: event.type,
    livemode: event.livemode,
    created: at(event.created),
    objectId: typeof object.id === "string" ? object.id : null,
  };
}

/**
 * The Stripe SDK behind the StripeGateway interface. Every read re-fetches
 * the current object (events can arrive late or out of order) and expands
 * the balance transaction, which carries Stripe's fee.
 */
export class StripeSdkGateway implements StripeGateway {
  private readonly stripe: Stripe;

  constructor(
    secretKey: string,
    private readonly webhookSecret: string | undefined,
    /** Tests only: a recording HTTP client instead of the network. */
    httpClient?: Stripe.HttpClient,
  ) {
    this.stripe = new Stripe(secretKey, {
      maxNetworkRetries: 2,
      timeout: 20_000,
      appInfo: { name: "global-experiment-api" },
      ...(httpClient ? { httpClient } : {}),
    });
  }

  constructEvent(rawBody: Buffer, signatureHeader: string): StripeEventInfo {
    return verifyStripeEvent(this.stripe, rawBody, signatureHeader, this.webhookSecret);
  }

  async createCheckoutSession(input: CreateCheckoutSessionInput): Promise<{ id: string; url: string }> {
    const description = input.productName;
    const session = await this.call(
      () =>
      this.stripe.checkout.sessions.create(
        {
          mode: input.mode,
          line_items: [
            {
              quantity: 1,
              price_data: {
                currency: input.currency.toLowerCase(),
                unit_amount: input.amount,
                product_data: { name: input.productName },
                ...(input.mode === "subscription" ? { recurring: { interval: "month" as const } } : {}),
              },
            },
          ],
          payment_method_types: input.paymentMethodTypes,
          // Donations are received by the association itself: never Stripe Managed
          // Payments (Stripe as merchant of record for digital products), which some
          // accounts enable by default and which also refuses an explicit method list.
          managed_payments: { enabled: false },
          // The donor pays in the currency they chose (EUR, USD or CHF — the ledger's
          // currencies), never a local-currency conversion offered by Adaptive Pricing.
          adaptive_pricing: { enabled: false },
          // As little data as Stripe allows (client review 2026-10-21): the billing address only when the
          // payment method needs it, no phone, no tax ID, no terms checkbox. Not sent, because off is
          // Stripe's default and it refuses them as "off": name_collection (only accepted to turn a name
          // field on) and consent_collection.promotions (not offered to Swiss accounts). No shipping
          // address and no custom fields (not requested). Stripe always asks for the email.
          billing_address_collection: "auto",
          phone_number_collection: { enabled: false },
          tax_id_collection: { enabled: false },
          consent_collection: { terms_of_service: "none" },
          // No "Save my information with Link" box: it is ticked by default and asks for a phone number.
          wallet_options: { link: { display: "never" } },
          success_url: input.successUrl,
          cancel_url: input.cancelUrl,
          locale: "auto",
          metadata: { ...DONATION_METADATA },
          ...(input.mode === "payment"
            ? {
                submit_type: "donate" as const,
                // No Stripe customer is created for one-off donations: nothing to link a donor by.
                customer_creation: "if_required" as const,
                payment_intent_data: { metadata: { ...DONATION_METADATA }, description },
              }
            : { subscription_data: { metadata: { ...DONATION_METADATA }, description } }),
        },
        { idempotencyKey: input.idempotencyKey },
      ),
      // Stripe refuses a method/currency combination the account doesn't support.
      () => new ValidationFailedError([{ path: "method", message: "This payment method is not available for this currency right now." }]),
    );
    if (!session.url) throw new ProviderUnavailableError("Stripe");
    return { id: session.id, url: session.url };
  }

  async getCheckoutSession(id: string): Promise<CheckoutSessionInfo> {
    const session = await this.call(() => this.stripe.checkout.sessions.retrieve(id));
    return {
      id: session.id,
      mode: session.mode,
      status: session.status,
      paymentStatus: session.payment_status,
      paymentIntentId: idOf(session.payment_intent),
      subscriptionId: idOf(session.subscription),
      donation: isDonation(session.metadata),
    };
  }

  async createPaymentIntent(input: CreatePaymentIntentInput): Promise<{ id: string; clientSecret: string }> {
    const intent = await this.call(
      () =>
        this.stripe.paymentIntents.create(
          {
            amount: input.amount,
            currency: input.currency.toLowerCase(),
            // Card fields only (no email): wallets, PayPal and SEPA stay on hosted Checkout.
            payment_method_types: ["card"],
            description: input.description,
            metadata: { ...DONATION_METADATA, flow: EMBEDDED_FLOW },
          },
          { idempotencyKey: input.idempotencyKey },
        ),
      () => new ValidationFailedError([{ path: "method", message: "This payment method is not available for this currency right now." }]),
    );
    if (!intent.client_secret) throw new ProviderUnavailableError("Stripe");
    return { id: intent.id, clientSecret: intent.client_secret };
  }

  async getPaymentIntent(id: string): Promise<PaymentIntentInfo> {
    const intent = await this.call(() => this.stripe.paymentIntents.retrieve(id));
    return {
      id: intent.id,
      status: intent.status,
      amount: intent.amount,
      currency: intent.currency.toUpperCase(),
      donation: isDonation(intent.metadata),
      embedded: intent.metadata?.flow === EMBEDDED_FLOW,
    };
  }

  async getPaymentIntentCharge(paymentIntentId: string): Promise<ChargeInfo | null> {
    const intent = await this.call(() => this.stripe.paymentIntents.retrieve(paymentIntentId, { expand: ["latest_charge.balance_transaction"] }));
    const charge = intent.latest_charge;
    if (!charge || typeof charge === "string") return null;
    return this.chargeInfo(charge, isDonation(intent.metadata));
  }

  async getCharge(chargeId: string): Promise<ChargeInfo> {
    const charge = await this.call(() => this.stripe.charges.retrieve(chargeId, { expand: ["balance_transaction", "payment_intent"] }));
    const intent = charge.payment_intent;
    return this.chargeInfo(charge, isDonation(charge.metadata) || (typeof intent === "object" && intent !== null && isDonation(intent.metadata)));
  }

  async listRefunds(chargeId: string): Promise<RefundInfo[]> {
    return this.call(async () => {
      const refunds: RefundInfo[] = [];
      for await (const refund of this.stripe.refunds.list({ charge: chargeId, limit: 100, expand: ["data.balance_transaction"] })) {
        refunds.push(this.refundInfo(refund));
      }
      return refunds;
    });
  }

  async getRefund(refundId: string): Promise<RefundInfo> {
    return this.refundInfo(await this.call(() => this.stripe.refunds.retrieve(refundId, { expand: ["balance_transaction"] })));
  }

  async getInvoiceCharge(invoiceId: string): Promise<InvoiceChargeInfo> {
    const invoice = await this.call(() => this.stripe.invoices.retrieve(invoiceId));
    const details = invoice.parent?.subscription_details ?? null;
    const subscriptionId = details ? idOf(details.subscription) : null;
    const donation = isDonation(details?.metadata ?? null);
    if (invoice.amount_paid <= 0) return { donation, subscriptionId, charge: null };
    const payments = await this.call(() => this.stripe.invoicePayments.list({ invoice: invoiceId, status: "paid", limit: 10 }));
    const intentId = payments.data.map((payment) => idOf(payment.payment.payment_intent ?? null)).find(Boolean) ?? null;
    const charge = intentId ? await this.getPaymentIntentCharge(intentId) : null;
    return { donation, subscriptionId, charge: charge ? { ...charge, donation: donation || charge.donation } : null };
  }

  async getSubscription(subscriptionId: string): Promise<SubscriptionInfo> {
    const subscription = await this.call(() => this.stripe.subscriptions.retrieve(subscriptionId));
    const item = subscription.items.data[0];
    return {
      id: subscription.id,
      status: subscription.status,
      currency: subscription.currency.toUpperCase(),
      amount: (item?.price.unit_amount ?? 0) * (item?.quantity ?? 1),
      startedAt: at(subscription.start_date),
      canceledAt: subscription.canceled_at ? at(subscription.canceled_at) : null,
      donation: isDonation(subscription.metadata),
    };
  }

  async getDispute(disputeId: string): Promise<DisputeInfo> {
    const dispute = await this.call(() => this.stripe.disputes.retrieve(disputeId));
    return {
      id: dispute.id,
      chargeId: idOf(dispute.charge)!,
      amount: dispute.amount,
      currency: dispute.currency.toUpperCase(),
      status: dispute.status,
      balanceTransactions: dispute.balance_transactions.map((transaction) => ({ id: transaction.id, created: at(transaction.created), ...balanceOf(transaction)! })),
    };
  }

  private chargeInfo(charge: Stripe.Charge, donation: boolean): ChargeInfo {
    return {
      id: charge.id,
      amount: charge.amount,
      currency: charge.currency.toUpperCase(),
      created: at(charge.created),
      status: charge.status,
      donation,
      balance: balanceOf(charge.balance_transaction),
    };
  }

  private refundInfo(refund: Stripe.Refund): RefundInfo {
    return {
      id: refund.id,
      amount: refund.amount,
      currency: refund.currency.toUpperCase(),
      created: at(refund.created),
      status: refund.status ?? "pending",
      balance: balanceOf(refund.balance_transaction),
    };
  }

  /**
   * Stripe outages, network and authentication errors become a 502 for the
   * caller; an invalid request is either mapped (`onInvalid`) or rethrown
   * as is (a bug or a missing object). Nothing about the request is logged here.
   */
  private async call<T>(request: () => Promise<T>, onInvalid?: () => Error): Promise<T> {
    try {
      return await request();
    } catch (error) {
      if (error instanceof Stripe.errors.StripeInvalidRequestError) {
        if (!onInvalid) throw error;
        // Kept for the log (stripeDiagnostics): Stripe's request id finds the full error in the Dashboard.
        throw Object.assign(onInvalid(), {
          stripe: { type: error.rawType ?? error.type, code: error.code ?? null, param: error.param ?? null, requestId: error.requestId ?? null },
        });
      }
      throw new ProviderUnavailableError("Stripe", { cause: error });
    }
  }
}
