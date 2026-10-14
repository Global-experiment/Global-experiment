import { Module } from "@nestjs/common";
import { APP_CONFIG } from "../common/config/config.module.js";
import type { AppConfig } from "../common/config/env.js";
import { TreasuryModule } from "../treasury/treasury.module.js";
import { StripeEventsRepository } from "./stripe-events.repository.js";
import { StripeFeeReconciliationService } from "./stripe-fee-reconciliation.service.js";
import { FixtureStripeGateway } from "./stripe-fixture.gateway.js";
import { StripeSdkGateway } from "./stripe-sdk.gateway.js";
import { StripeWebhookController } from "./stripe-webhook.controller.js";
import { StripeWebhookService } from "./stripe-webhook.service.js";
import { STRIPE_GATEWAY } from "./stripe.gateway.js";

/**
 * Stripe: the gateway (null when STRIPE_SECRET_KEY isn't configured — the
 * donation endpoints then answer "not configured"), webhook processing and
 * the late-fee fill-in. Tests replace STRIPE_GATEWAY with a test double.
 */
@Module({
  imports: [TreasuryModule],
  controllers: [StripeWebhookController],
  providers: [
    {
      provide: STRIPE_GATEWAY,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) =>
        config.stripe.fixture
          ? new FixtureStripeGateway()
          : config.stripe.secretKey
            ? new StripeSdkGateway(config.stripe.secretKey, config.stripe.webhookSecret)
            : null,
    },
    StripeEventsRepository,
    StripeWebhookService,
    StripeFeeReconciliationService,
  ],
  exports: [STRIPE_GATEWAY, StripeFeeReconciliationService],
})
export class StripeModule {}
