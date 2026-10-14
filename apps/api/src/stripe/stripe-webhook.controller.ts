import { Controller, Headers, HttpCode, Inject, Post, Req } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import type { Request } from "express";
import { ApiError, ValidationFailedError } from "../common/errors/api-error.js";
import { StripeWebhookService } from "./stripe-webhook.service.js";
import { STRIPE_GATEWAY, StripeSignatureError, type StripeGateway } from "./stripe.gateway.js";

/**
 * POST /api/stripe/webhook — Stripe's deliveries. The body arrives raw
 * (bootstrap.ts registers a raw parser for this path only) because the
 * signature covers the exact bytes. A non-2xx answer makes Stripe retry;
 * duplicates are answered 200 without effect.
 */
@Controller("stripe")
@SkipThrottle()
export class StripeWebhookController {
  constructor(
    @Inject(STRIPE_GATEWAY) private readonly stripe: StripeGateway | null,
    private readonly webhooks: StripeWebhookService,
  ) {}

  @Post("webhook")
  @HttpCode(200)
  async receive(@Req() req: Request, @Headers("stripe-signature") signature: string | undefined) {
    if (!this.stripe) throw new ApiError("provider_unavailable", "Donations are not configured.");
    const raw: unknown = req.body;
    if (!Buffer.isBuffer(raw) || !signature) throw new ValidationFailedError([{ path: "stripe-signature", message: "A signed Stripe event is required." }]);
    let event;
    try {
      event = this.stripe.constructEvent(raw, signature);
    } catch (error) {
      if (error instanceof StripeSignatureError) throw new ValidationFailedError([{ path: "stripe-signature", message: "Invalid signature." }]);
      throw error;
    }
    const result = await this.webhooks.handle(event);
    return { received: true, result };
  }
}
