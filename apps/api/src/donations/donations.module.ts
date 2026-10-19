import { Body, Controller, Get, Headers, HttpCode, Inject, Injectable, Module, Param, Post, UseGuards, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request } from "express";
import { APP_CONFIG } from "../common/config/config.module.js";
import type { AppConfig } from "../common/config/env.js";
import { ForbiddenError } from "../common/errors/api-error.js";
import { ZodValidationPipe } from "../common/validation/zod-validation.pipe.js";
import { StripeModule } from "../stripe/stripe.module.js";
import { CheckoutRequest, DonationsService, PaymentIntentRequest } from "./donations.service.js";

/**
 * Only the public site may start a Checkout: the request's Origin must be
 * the site (PUBLIC_SITE_URL; outside production also the local dev
 * origins). Refuses requests with no Origin — browsers always send it on a
 * cross-origin-capable POST.
 */
@Injectable()
export class SiteOriginGuard implements CanActivate {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  canActivate(context: ExecutionContext): boolean {
    const origin = context.switchToHttp().getRequest<Request>().headers.origin;
    const allowed = new Set([this.config.publicSiteUrl, ...(this.config.nodeEnv === "production" ? [] : this.config.adminAllowedOrigins)]);
    if (typeof origin !== "string" || !allowed.has(origin)) throw new ForbiddenError("Cross-site request refused.");
    return true;
  }
}

/** Per client IP; generous for a person, tight for a script. */
const CHECKOUT_LIMIT = { default: { limit: 10, ttl: 60_000 } };
const STATUS_LIMIT = { default: { limit: 30, ttl: 60_000 } };

@Controller("donations")
export class DonationsController {
  constructor(private readonly donations: DonationsService) {}

  /**
   * GET /api/donations/config — what the donate page offers (no secrets).
   * The page's server sends the preview token, if any, in x-donations-preview.
   */
  @Get("config")
  config(@Headers("x-donations-preview") previewToken: string | undefined) {
    return this.donations.publicConfig(previewToken);
  }

  /** POST /api/donations/checkout — a Stripe Checkout session; the page redirects to `url`. */
  @Post("checkout")
  @HttpCode(201)
  @UseGuards(SiteOriginGuard)
  @Throttle(CHECKOUT_LIMIT)
  checkout(@Body(new ZodValidationPipe(CheckoutRequest)) body: CheckoutRequest) {
    return this.donations.createCheckout(body);
  }

  /** POST /api/donations/payment-intent — a one-off card donation paid on the page (embedded card fields). */
  @Post("payment-intent")
  @HttpCode(201)
  @UseGuards(SiteOriginGuard)
  @Throttle(CHECKOUT_LIMIT)
  paymentIntent(@Body(new ZodValidationPipe(PaymentIntentRequest)) body: PaymentIntentRequest) {
    return this.donations.createPaymentIntent(body);
  }

  /** GET /api/donations/payment-intents/:id — the thank-you page's check after an embedded payment. */
  @Get("payment-intents/:id")
  @Throttle(STATUS_LIMIT)
  paymentIntentStatus(@Param("id") id: string) {
    return this.donations.paymentIntentStatus(id);
  }

  /** GET /api/donations/checkout/:sessionId — the thank-you page's status check. */
  @Get("checkout/:sessionId")
  @Throttle(STATUS_LIMIT)
  status(@Param("sessionId") sessionId: string) {
    return this.donations.sessionStatus(sessionId);
  }
}

@Module({
  imports: [StripeModule],
  controllers: [DonationsController],
  providers: [DonationsService, SiteOriginGuard],
})
export class DonationsModule {}
