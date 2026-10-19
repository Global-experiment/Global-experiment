import { createHash, timingSafeEqual } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { PinoLogger } from "nestjs-pino";
import { z } from "zod";
import { APP_CONFIG } from "../common/config/config.module.js";
import type { AppConfig } from "../common/config/env.js";
import { ApiError, NotFoundError, ValidationFailedError } from "../common/errors/api-error.js";
import { SettingsService } from "../settings/settings.service.js";
import { STRIPE_GATEWAY, type StripeGateway } from "../stripe/stripe.gateway.js";
import { TREASURY_CURRENCIES, type TreasuryCurrency } from "../treasury/treasury.schema.js";
import {
  checkoutIssues,
  DONATION_METHOD_ORDER,
  DONATION_METHODS,
  DONATION_RULES,
  methodAvailable,
  methodFrequencies,
  parseAmountToMinor,
  type DonationFlags,
  type DonationFrequency,
  type DonationMethodKey,
} from "./donation-rules.js";

export const CheckoutRequest = z.strictObject({
  /** In the chosen currency, as typed: "10", "10.50" or "10,50". */
  amount: z.string().trim().min(1).max(12),
  currency: z.enum(TREASURY_CURRENCIES),
  frequency: z.enum(["once", "monthly"]),
  method: z.enum(["card", "apple_pay", "google_pay", "paypal", "sepa_debit"]),
  /** One id per donate attempt (the page makes it): a double click opens the same Checkout. */
  attemptId: z.uuid(),
  /** The private preview token, while donations are closed (never stored or logged). */
  previewToken: z.string().max(200).optional(),
});
export type CheckoutRequest = z.output<typeof CheckoutRequest>;

export const SESSION_ID = /^cs_(test|live)_[A-Za-z0-9]{10,200}$/;

/** A one-off card donation on the donate page itself (decided 2026-10-19: no email asked). */
export const PaymentIntentRequest = z.strictObject({
  amount: z.string().trim().min(1).max(12),
  currency: z.enum(TREASURY_CURRENCIES),
  attemptId: z.uuid(),
  previewToken: z.string().max(200).optional(),
});
export type PaymentIntentRequest = z.output<typeof PaymentIntentRequest>;

export const PAYMENT_INTENT_ID = /^pi_[A-Za-z0-9]{10,200}$/;

/** What the donor sees instead of an email receipt: the payment's last 8 characters ("GE-3QX7K2PA"). */
export const donationReference = (paymentIntentId: string) => `GE-${paymentIntentId.slice(-8).toUpperCase()}`;

export interface DonationConfigDto {
  /** False when Stripe isn't configured: the page explains that donations are unavailable. */
  available: boolean;
  /** False until donations open (donations.enabled) — true earlier only with the preview token. */
  enabled: boolean;
  currencies: readonly TreasuryCurrency[];
  defaultCurrency: TreasuryCurrency;
  presets: readonly number[];
  minimum: number;
  maximum: number;
  monthly: boolean;
  /**
   * How a one-off card donation is paid: "embedded" (Stripe's card fields on
   * the page, no email) when donations.checkout says so and a publishable
   * key is configured; otherwise "hosted" (Checkout).
   */
  checkout: "embedded" | "hosted";
  /** Public by design; set only with checkout = "embedded". */
  publishableKey: string | null;
  methods: { key: DonationMethodKey; currencies: readonly TreasuryCurrency[]; frequencies: readonly DonationFrequency[] }[];
  /** Stripe's customer-portal login link, offered only when monthly donations are on. */
  customerPortalUrl: string | null;
}

/** Product names on Stripe Checkout and the donor's receipt. */
const PRODUCT_NAME = {
  once: "Donation to the Global Experiment",
  monthly: "Monthly donation to the Global Experiment",
} as const;

/**
 * The donate flow: public configuration, Checkout session creation (one-off
 * or subscription) and the thank-you page's session check. Nothing about the
 * donor is ever stored or logged; Stripe collects what it needs.
 */
@Injectable()
export class DonationsService {
  constructor(
    @Inject(STRIPE_GATEWAY) private readonly stripe: StripeGateway | null,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly settings: SettingsService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(DonationsService.name);
  }

  private async flags(
    previewToken?: string,
  ): Promise<DonationFlags & { defaultCurrency: TreasuryCurrency; enabled: boolean; checkout: "embedded" | "hosted" }> {
    const values = await this.settings.getMany([
      "donations.enabled",
      "donations.monthly",
      "donations.extra_methods",
      "donations.paypal_monthly",
      "donations.default_currency",
      "donations.checkout",
    ]);
    const embedded = values["donations.checkout"] === "embedded" && this.config.stripe.publishableKey !== undefined;
    return {
      enabled: values["donations.enabled"] || this.validPreview(previewToken),
      monthly: values["donations.monthly"],
      extraMethods: values["donations.extra_methods"],
      paypalMonthly: values["donations.paypal_monthly"],
      defaultCurrency: values["donations.default_currency"],
      checkout: embedded ? "embedded" : "hosted",
    };
  }

  /** Constant-time comparison with DONATIONS_PREVIEW_TOKEN; no token configured = no preview. */
  private validPreview(token: string | undefined): boolean {
    const expected = this.config.donationPreviewToken;
    if (!expected || !token) return false;
    const digest = (value: string) => createHash("sha256").update(value).digest();
    return timingSafeEqual(digest(token), digest(expected));
  }

  async publicConfig(previewToken?: string): Promise<DonationConfigDto> {
    const flags = await this.flags(previewToken);
    return {
      available: this.stripe !== null,
      enabled: flags.enabled,
      currencies: DONATION_RULES.currencies,
      defaultCurrency: flags.defaultCurrency,
      presets: DONATION_RULES.presets,
      minimum: DONATION_RULES.minimum,
      maximum: DONATION_RULES.maximum,
      monthly: flags.monthly,
      checkout: flags.checkout,
      publishableKey: flags.checkout === "embedded" ? (this.config.stripe.publishableKey ?? null) : null,
      methods: DONATION_METHOD_ORDER.filter((key) => methodAvailable(key, flags)).map((key) => ({
        key,
        currencies: DONATION_METHODS[key].currencies,
        frequencies: methodFrequencies(key, flags),
      })),
      customerPortalUrl: flags.monthly ? (this.config.stripe.customerPortalUrl ?? null) : null,
    };
  }

  async createCheckout(request: CheckoutRequest): Promise<{ url: string }> {
    const stripe = this.requireStripe();
    const flags = await this.flags(request.previewToken);
    if (!flags.enabled) throw new ApiError("forbidden", "Donations are not open yet.", { reason: "donations_closed" });
    const issues = checkoutIssues(request, flags);
    if (issues.length > 0) throw new ValidationFailedError(issues);
    const amount = parseAmountToMinor(request.amount)!;

    // Back to the donate page with the same choices (cancel), or to the thank-you page.
    const choice = new URLSearchParams({ currency: request.currency, amount: (amount / 100).toFixed(amount % 100 === 0 ? 0 : 2), frequency: request.frequency });
    const site = this.config.publicSiteUrl;
    // {CHECKOUT_SESSION_ID} is Stripe's placeholder: it must stay unencoded.
    const successUrl = `${site}/donate/thank-you?${choice.toString()}&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${site}/donate?${choice.toString()}&canceled=1`;

    const fingerprint = createHash("sha256").update(JSON.stringify([amount, request.currency, request.frequency, request.method])).digest("hex").slice(0, 16);

    const session = await stripe
      .createCheckoutSession({
      mode: request.frequency === "monthly" ? "subscription" : "payment",
      currency: request.currency,
      amount,
      paymentMethodTypes: [DONATION_METHODS[request.method].stripeType],
      productName: PRODUCT_NAME[request.frequency],
      successUrl,
      cancelUrl,
      // Same attempt + same choice = same session (a double click never opens two Checkouts).
      idempotencyKey: `donation-checkout:${request.attemptId}:${fingerprint}`,
    })
      .catch((error: unknown) => {
        // Stripe refused the request: why (type/code/param/request id — never donor data), for whoever operates the account.
        const stripeDetails = (error as { stripe?: unknown }).stripe;
        if (stripeDetails) this.logger.warn({ stripe: stripeDetails, currency: request.currency, frequency: request.frequency, method: request.method }, "Stripe refused the Checkout session");
        throw error;
      });
    this.logger.info(
      { sessionId: session.id, currency: request.currency, frequency: request.frequency, method: request.method, preview: request.previewToken !== undefined },
      "Checkout session created",
    );
    return { url: session.url };
  }

  /**
   * A one-off card donation paid on the donate page (Payment Element, card
   * fields only, no email). The same rules as Checkout; the webhook records
   * it from payment_intent.succeeded exactly like a Checkout payment.
   */
  async createPaymentIntent(request: PaymentIntentRequest): Promise<{ clientSecret: string; reference: string }> {
    const stripe = this.requireStripe();
    const flags = await this.flags(request.previewToken);
    if (!flags.enabled) throw new ApiError("forbidden", "Donations are not open yet.", { reason: "donations_closed" });
    if (flags.checkout !== "embedded") throw new ApiError("forbidden", "Card donations open Stripe Checkout.", { reason: "embedded_checkout_off" });
    const issues = checkoutIssues({ ...request, frequency: "once", method: "card" }, flags);
    if (issues.length > 0) throw new ValidationFailedError(issues);
    const amount = parseAmountToMinor(request.amount)!;
    const fingerprint = createHash("sha256").update(JSON.stringify([amount, request.currency])).digest("hex").slice(0, 16);
    const intent = await stripe
      .createPaymentIntent({
        currency: request.currency,
        amount,
        description: PRODUCT_NAME.once,
        idempotencyKey: `donation-intent:${request.attemptId}:${fingerprint}`,
      })
      .catch((error: unknown) => {
        const stripeDetails = (error as { stripe?: unknown }).stripe;
        if (stripeDetails) this.logger.warn({ stripe: stripeDetails, currency: request.currency }, "Stripe refused the payment intent");
        throw error;
      });
    this.logger.info({ paymentIntentId: intent.id, currency: request.currency, preview: request.previewToken !== undefined }, "Payment intent created");
    return { clientSecret: intent.clientSecret, reference: donationReference(intent.id) };
  }

  /** The thank-you page's check after an embedded card payment (3-D Secure returns there too). */
  async paymentIntentStatus(id: string): Promise<{ status: string; amount: number; currency: string; reference: string }> {
    const stripe = this.requireStripe();
    if (!PAYMENT_INTENT_ID.test(id)) throw new NotFoundError("Payment not found.");
    let intent;
    try {
      intent = await stripe.getPaymentIntent(id);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new NotFoundError("Payment not found.");
    }
    if (!intent.donation || !intent.embedded) throw new NotFoundError("Payment not found.");
    return { status: intent.status, amount: intent.amount, currency: intent.currency, reference: donationReference(intent.id) };
  }

  /** The thank-you page's check: only a completed donation session shows "Donation sent". */
  async sessionStatus(sessionId: string): Promise<{ status: string | null; paymentStatus: string; frequency: DonationFrequency }> {
    const stripe = this.requireStripe();
    if (!SESSION_ID.test(sessionId)) throw new NotFoundError("Checkout session not found.");
    let session;
    try {
      session = await stripe.getCheckoutSession(sessionId);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new NotFoundError("Checkout session not found.");
    }
    if (!session.donation) throw new NotFoundError("Checkout session not found.");
    return { status: session.status, paymentStatus: session.paymentStatus, frequency: session.mode === "subscription" ? "monthly" : "once" };
  }

  private requireStripe(): StripeGateway {
    if (!this.stripe) throw new ApiError("provider_unavailable", "Donations are not available right now.");
    return this.stripe;
  }
}
