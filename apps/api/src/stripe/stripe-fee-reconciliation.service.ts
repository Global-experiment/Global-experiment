import { Inject, Injectable, type OnApplicationBootstrap, type OnModuleInit } from "@nestjs/common";
import { PinoLogger } from "nestjs-pino";
import { CLOCK, type Clock } from "../common/clock/clock.js";
import { APP_CONFIG } from "../common/config/config.module.js";
import type { AppConfig } from "../common/config/env.js";
import { everyMinutesCron, JOB_QUEUE, type JobQueue } from "../jobs/job-queue.js";
import { PUBLIC_CACHE_TAGS, RevalidationService } from "../revalidation/revalidation.service.js";
import { amountsFromBalance, TreasuryLedgerRepository } from "../treasury/treasury-ledger.repository.js";
import { STRIPE_GATEWAY, type StripeGateway } from "./stripe.gateway.js";

const BATCH = 50;

/**
 * Late fees: some payment methods settle after the webhook, so Stripe's
 * balance transaction (and thus the fee) isn't known yet. Every
 * STRIPE_FEE_RECONCILE_MINUTES this fills fee and net for those entries —
 * once; known amounts are never overwritten. A scheduled job on the job
 * queue (overview §3.3, roadmap 1b): one run at a time, wherever it runs.
 */
export const FEE_RECONCILE_QUEUE = "stripe.fee-reconcile";

@Injectable()
export class StripeFeeReconciliationService implements OnModuleInit, OnApplicationBootstrap {
  private running = false;

  constructor(
    @Inject(STRIPE_GATEWAY) private readonly stripe: StripeGateway | null,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly ledger: TreasuryLedgerRepository,
    private readonly revalidation: RevalidationService,
    private readonly logger: PinoLogger,
    @Inject(JOB_QUEUE) private readonly queue: JobQueue,
  ) {
    this.logger.setContext(StripeFeeReconciliationService.name);
  }

  onModuleInit(): void {
    this.queue.define(FEE_RECONCILE_QUEUE, () => this.reconcile(), { policy: "exclusive", retryLimit: 0, expireInSeconds: 600 });
  }

  /** Every STRIPE_FEE_RECONCILE_MINUTES (0 or no Stripe: off). Tests call reconcile() directly. */
  async onApplicationBootstrap(): Promise<void> {
    const minutes = this.config.stripe.feeReconcileMinutes;
    const cron = this.stripe && minutes > 0 ? everyMinutesCron(minutes) : null;
    try {
      await this.queue.schedule(FEE_RECONCILE_QUEUE, "every", cron, {});
    } catch (error) {
      this.logger.error({ reason: error instanceof Error ? error.name : "unknown" }, "Couldn't schedule the Stripe fee fill-in");
    }
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
