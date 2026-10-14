import { Inject, Injectable } from "@nestjs/common";
import { eq, sql } from "drizzle-orm";
import { DATABASE, type Database } from "../common/database/database.module.js";
import type { Executor } from "../treasury/treasury-ledger.repository.js";
import type { StripeEventInfo } from "./stripe.gateway.js";
import { stripeEvents } from "./stripe.schema.js";

export type StripeEventStatus = "received" | "processed" | "ignored" | "failed";

/** Bookkeeping of webhook events: the exactly-once guard (one row per Stripe event id). */
@Injectable()
export class StripeEventsRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** Records the event if new; returns its current status either way. */
  async receive(event: StripeEventInfo): Promise<StripeEventStatus> {
    await this.db
      .insert(stripeEvents)
      .values({ id: event.id, type: event.type, livemode: event.livemode, objectId: event.objectId, stripeCreatedAt: event.created })
      .onConflictDoNothing({ target: stripeEvents.id });
    const [row] = await this.db.select({ status: stripeEvents.status }).from(stripeEvents).where(eq(stripeEvents.id, event.id));
    return row!.status as StripeEventStatus;
  }

  /** Inside the processing transaction: locks the event row so a concurrent delivery waits, then reports its status. */
  async lock(executor: Executor, eventId: string): Promise<StripeEventStatus> {
    const [row] = await executor.select({ status: stripeEvents.status }).from(stripeEvents).where(eq(stripeEvents.id, eventId)).for("update");
    return row!.status as StripeEventStatus;
  }

  async finish(executor: Executor, eventId: string, status: "processed" | "ignored", entryId: string | null, now: Date): Promise<void> {
    await executor
      .update(stripeEvents)
      .set({ status, processedAt: now, entryId, attempts: sql`${stripeEvents.attempts} + 1`, lastError: null })
      .where(eq(stripeEvents.id, eventId));
  }

  /** A failed attempt: Stripe retries the delivery; the reason is a short code, never data. */
  async fail(eventId: string, reason: string): Promise<void> {
    await this.db
      .update(stripeEvents)
      .set({ status: "failed", attempts: sql`${stripeEvents.attempts} + 1`, lastError: reason.slice(0, 1000) })
      .where(eq(stripeEvents.id, eventId));
  }
}
