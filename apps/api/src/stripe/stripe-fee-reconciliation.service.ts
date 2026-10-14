import { Inject, Injectable, type OnApplicationBootstrap, type OnApplicationShutdown } from "@nestjs/common";
import { PinoLogger } from "nestjs-pino";
import { CLOCK, type Clock } from "../common/clock/clock.js";
import { APP_CONFIG } from "../common/config/config.module.js";
import type { AppConfig } from "../common/config/env.js";
import { PUBLIC_CACHE_TAGS, RevalidationService } from "../revalidation/revalidation.service.js";
import { amountsFromBalance, TreasuryLedgerRepository } from "../treasury/treasury-ledger.repository.js";
import { STRIPE_GATEWAY, type StripeGateway } from "./stripe.gateway.js";

const BATCH = 50;

/**
 * Late fees: some payment methods settle after the webhook, so Stripe's
 * balance transaction (and thus the fee) isn't known yet. Every
 * STRIPE_FEE_RECONCILE_MINUTES this fills fee and net for those entries —
 * once; known amounts are never overwritten. A timer in the API process
 * for now; it moves to the job runner with module 1b (roadmap).
 */
@Injectable()
export class StripeFeeReconciliationService implements OnApplicationBootstrap, OnApplicationShutdown {
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  constructor(
    @Inject(STRIPE_GATEWAY) private readonly stripe: StripeGateway | null,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly ledger: TreasuryLedgerRepository,
    private readonly revalidation: RevalidationService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(StripeFeeReconciliationService.name);
  }

  onApplicationBootstrap(): void {
    const minutes = this.config.stripe.feeReconcileMinutes;
    // Tests call reconcile() directly; a timer would race them.
    if (!this.stripe || minutes === 0 || this.config.nodeEnv === "test") return;
    this.timer = setInterval(() => void this.reconcile(), minutes * 60_000);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    clearInterval(this.timer);
  }

  /** One pass; returns how many entries got their fee. */
  async reconcile(): Promise<{ checked: number; filled: number }> {
    if (!this.stripe || this.running) return { checked: 0, filled: 0 };
    this.running = true;
    let filled = 0;
    let checked = 0;
    try {
      for (const entry of await this.ledger.entriesAwaitingFee(BATCH)) {
        checked++;
        try {
          const balance =
            entry.entryType === "refund" ? (await this.stripe.getRefund(entry.externalId)).balance : (await this.stripe.getCharge(entry.externalId)).balance;
          if (await this.ledger.applyAmounts(entry.id, amountsFromBalance(entry.grossAmount, entry.currency, balance), this.clock())) filled++;
        } catch (error) {
          this.logger.warn({ entryId: entry.id, reason: error instanceof Error ? error.name : "unknown" }, "Fee fill-in failed for an entry; retried next run");
        }
      }
      if (checked > 0) this.logger.info({ checked, filled }, "Stripe fee fill-in run");
      if (filled > 0) await this.revalidation.revalidate([PUBLIC_CACHE_TAGS.treasury]);
      return { checked, filled };
    } finally {
      this.running = false;
    }
  }
}
