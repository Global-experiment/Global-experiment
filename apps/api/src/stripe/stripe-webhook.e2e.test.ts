import Stripe from "stripe";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { asc, eq } from "drizzle-orm";
import { RevalidationService } from "../revalidation/revalidation.service.js";
import { cardFee, FAKE_WEBHOOK_SECRET, FakeStripe, signedEvent } from "../testing/fake-stripe.js";
import { createTestApp, type TestApp } from "../testing/test-app.js";
import { treasuryEntries } from "../treasury/treasury.schema.js";
import { StripeFeeReconciliationService } from "./stripe-fee-reconciliation.service.js";
import { stripeEvents, stripeSubscriptions } from "./stripe.schema.js";
import { STRIPE_GATEWAY } from "./stripe.gateway.js";

/**
 * POST /api/stripe/webhook end to end: raw body, Stripe's real signature
 * check (deliveries signed with Stripe's own test-signature helper), the
 * exactly-once bookkeeping and the ledger rows it writes.
 */
describe("Stripe webhook (HTTP, Stripe test double)", () => {
  let t: TestApp;
  const stripe = new FakeStripe();
  const revalidation = { revalidate: vi.fn(async () => true) };

  beforeAll(async () => {
    t = await createTestApp({}, [
      { provide: STRIPE_GATEWAY, useValue: stripe },
      { provide: RevalidationService, useValue: revalidation },
    ]);
  });
  afterAll(async () => {
    await t.close();
  });
  afterEach(async () => {
    revalidation.revalidate.mockClear();
    await t.db.delete(stripeEvents);
    await t.db.delete(treasuryEntries).where(eq(treasuryEntries.entryType, "refund"));
    await t.db.delete(treasuryEntries);
    await t.db.delete(stripeSubscriptions);
  });

  const deliver = (event: { payload: string; header: string }) =>
    request(t.app.getHttpServer()).post("/api/stripe/webhook").set("content-type", "application/json").set("stripe-signature", event.header).send(event.payload);

  const send = async (type: string, objectId: string, options: Parameters<typeof signedEvent>[2] = {}) => {
    const event = signedEvent(type, objectId, options);
    const res = await deliver(event);
    return { event, res };
  };

  const entries = () => t.db.select().from(treasuryEntries).orderBy(asc(treasuryEntries.entryNumber));
  const eventRow = async (id: string) => (await t.db.select().from(stripeEvents).where(eq(stripeEvents.id, id)))[0]!;

  describe("signature", () => {
    it("accepts a correctly signed delivery", async () => {
      const { res } = await send("customer.created", "cus_123");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true, result: "ignored" });
    });

    it("refuses a missing, malformed, foreign, stale or tampered signature, recording nothing", async () => {
      const event = signedEvent("checkout.session.completed", "cs_test_x");
      const post = (header: string | null, body = event.payload) => {
        const call = request(t.app.getHttpServer()).post("/api/stripe/webhook").set("content-type", "application/json");
        return (header === null ? call : call.set("stripe-signature", header)).send(body);
      };
      const signer = new Stripe("sk_test_signing_only_never_used_for_calls");
      const stale = signer.webhooks.generateTestHeaderString({ payload: event.payload, secret: FAKE_WEBHOOK_SECRET, timestamp: Math.floor(Date.now() / 1000) - 3600 });
      const foreign = signedEvent("checkout.session.completed", "cs_test_x", { secret: "whsec_someoneelsessecret000000" });

      for (const [label, response] of [
        ["missing", await post(null)],
        ["malformed", await post("v1=deadbeef")],
        ["foreign secret", await post(foreign.header, foreign.payload)],
        ["stale timestamp (replay)", await post(stale)],
        ["tampered body", await post(event.header, event.payload.replace("cs_test_x", "cs_test_y"))],
      ] as const) {
        expect(response.status, label).toBe(400);
        expect(response.body.error.code, label).toBe("validation_failed");
      }
      expect(await t.db.select().from(stripeEvents)).toEqual([]);
    });
  });

  describe("one-off donations", () => {
    it("records an embedded card donation (payment_intent.succeeded) once, like a Checkout payment", async () => {
      const donation = stripe.embeddedDonation("USD", 2000);
      const { res } = await send("payment_intent.succeeded", donation.intentId);
      expect(res.body).toEqual({ received: true, result: "processed" });
      const [entry] = await entries();
      expect(entry).toMatchObject({
        entryType: "donation",
        name: "Anonymous donation",
        currency: "USD",
        grossAmount: 2000,
        feeAmount: cardFee(2000),
        cadence: "one_off",
        source: "stripe",
        externalTransactionId: donation.chargeId,
        publicationStatus: "published",
      });
      // A redelivery (new event id) finds the same charge: still one entry.
      await send("payment_intent.succeeded", donation.intentId);
      expect(await entries()).toHaveLength(1);
    });

    it("ignores payment_intent.succeeded for Checkout's own payments and for payments that aren't donations", async () => {
      const checkout = stripe.oneOffDonation("EUR", 1000);
      expect((await send("payment_intent.succeeded", checkout.intentId)).res.body).toEqual({ received: true, result: "ignored" });
      const foreign = stripe.embeddedDonation("EUR", 1000, { donation: false });
      expect((await send("payment_intent.succeeded", foreign.intentId)).res.body).toEqual({ received: true, result: "ignored" });
      expect(await entries()).toEqual([]);
    });

    it("records a completed Checkout as a published, anonymous native donation with Stripe's fee", async () => {
      const donation = stripe.oneOffDonation("EUR", 1000);
      const { event, res } = await send("checkout.session.completed", donation.sessionId);
      expect(res.body).toEqual({ received: true, result: "processed" });

      const [entry] = await entries();
      expect(entry).toMatchObject({
        managedBy: "native",
        notionPageId: null,
        entryType: "donation",
        name: "Anonymous donation",
        currency: "EUR",
        grossAmount: 1000,
        feeAmount: cardFee(1000),
        netAmount: 1000 - cardFee(1000),
        settlementCurrency: null,
        cadence: "one_off",
        source: "stripe",
        externalTransactionId: donation.chargeId,
        recurrenceId: null,
        occurredOn: "2026-10-15",
        occurredAt: new Date("2026-10-15T09:30:00Z"),
        adjustsEntryId: null,
        reviewStatusKey: "not_required",
        publicationStatus: "published",
        publicDescription: "Anonymous donation",
        internalNote: null,
        createdByAdminId: null,
      });
      expect(await eventRow(event.id)).toMatchObject({ type: "checkout.session.completed", status: "processed", attempts: 1, lastError: null, entryId: entry!.id, objectId: donation.sessionId });
      expect(revalidation.revalidate).toHaveBeenCalledExactlyOnceWith(["treasury"]);
    });

    it("records each currency in its own currency", async () => {
      for (const [currency, amount] of [["EUR", 500], ["USD", 2000], ["CHF", 5000]] as const) {
        await send("checkout.session.completed", stripe.oneOffDonation(currency, amount).sessionId);
      }
      expect((await entries()).map((entry) => [entry.currency, entry.grossAmount])).toEqual([
        ["EUR", 500],
        ["USD", 2000],
        ["CHF", 5000],
      ]);
    });

    it("keeps Stripe's settlement figures when the payment settled in another currency", async () => {
      const donation = stripe.oneOffDonation("USD", 2000);
      stripe.charges.get(donation.chargeId)!.balance = { currency: "EUR", amount: 1840, fee: 83, net: 1757, exchangeRate: 0.92 };
      await send("checkout.session.completed", donation.sessionId);
      expect((await entries())[0]).toMatchObject({
        currency: "USD",
        grossAmount: 2000,
        feeAmount: null,
        netAmount: null,
        settlementCurrency: "EUR",
        settlementGrossAmount: 1840,
        settlementFeeAmount: 83,
        settlementNetAmount: 1757,
        exchangeRate: "0.92000000",
      });
    });

    it("waits for delayed methods (SEPA): pending at completion, recorded on async_payment_succeeded", async () => {
      const donation = stripe.oneOffDonation("EUR", 2500, { paid: false });
      const pending = await send("checkout.session.completed", donation.sessionId);
      expect(pending.res.body.result).toBe("ignored");
      expect(await entries()).toEqual([]);
      expect(revalidation.revalidate).not.toHaveBeenCalled();

      stripe.sessions.get(donation.sessionId)!.paymentStatus = "paid";
      stripe.charges.get(donation.chargeId)!.status = "succeeded";
      const succeeded = await send("checkout.session.async_payment_succeeded", donation.sessionId);
      expect(succeeded.res.body.result).toBe("processed");
      expect((await entries()).map((entry) => entry.grossAmount)).toEqual([2500]);
    });

    it("ignores Checkout sessions that aren't donations", async () => {
      const other = stripe.oneOffDonation("EUR", 1000, { donation: false });
      const { event, res } = await send("checkout.session.completed", other.sessionId);
      expect(res.body.result).toBe("ignored");
      expect(await eventRow(event.id)).toMatchObject({ status: "ignored", entryId: null });
      expect(await entries()).toEqual([]);
    });
  });

  describe("exactly once", () => {
    it("answers a redelivered event as a duplicate without writing twice", async () => {
      const donation = stripe.oneOffDonation("EUR", 1000);
      const { event } = await send("checkout.session.completed", donation.sessionId);
      const again = await deliver(signedEvent("checkout.session.completed", donation.sessionId, { id: event.id }));
      expect(again.body).toEqual({ received: true, result: "duplicate" });
      expect(await entries()).toHaveLength(1);
      expect((await eventRow(event.id)).attempts).toBe(1);
      expect(revalidation.revalidate).toHaveBeenCalledTimes(1);
    });

    it("writes one entry per charge even when different events describe it", async () => {
      const donation = stripe.oneOffDonation("EUR", 1000);
      await send("checkout.session.completed", donation.sessionId);
      const second = await send("checkout.session.async_payment_succeeded", donation.sessionId);
      expect(second.res.body.result).toBe("processed");
      expect(await entries()).toHaveLength(1);
      // Nothing new: no revalidation for the second event.
      expect(revalidation.revalidate).toHaveBeenCalledTimes(1);
    });

    it("handles concurrent deliveries of the same event once", async () => {
      const donation = stripe.oneOffDonation("EUR", 1000);
      const event = signedEvent("checkout.session.completed", donation.sessionId);
      const results = await Promise.all([deliver(event), deliver(event), deliver(event)]);
      expect(results.map((res) => res.status)).toEqual([200, 200, 200]);
      expect(results.map((res) => res.body.result).sort()).toEqual(["duplicate", "duplicate", "processed"]);
      expect(await entries()).toHaveLength(1);
    });

    it("answers 409 while the charge isn't ready, records the attempt, and succeeds on Stripe's retry", async () => {
      const donation = stripe.oneOffDonation("EUR", 1000);
      stripe.intents.set(donation.intentId, null);
      const first = await send("checkout.session.completed", donation.sessionId);
      expect(first.res.status).toBe(409);
      expect(await eventRow(first.event.id)).toMatchObject({ status: "failed", attempts: 1, lastError: "retry:charge_not_ready", processedAt: null });
      expect(await entries()).toEqual([]);

      stripe.intents.set(donation.intentId, donation.chargeId);
      const retry = await deliver(signedEvent("checkout.session.completed", donation.sessionId, { id: first.event.id }));
      expect(retry.body.result).toBe("processed");
      expect(await eventRow(first.event.id)).toMatchObject({ status: "processed", attempts: 2, lastError: null });
      expect(await entries()).toHaveLength(1);
    });

    it("ignores events from the other mode (a live event on a test key)", async () => {
      const donation = stripe.oneOffDonation("EUR", 1000);
      const { event, res } = await send("checkout.session.completed", donation.sessionId, { livemode: true });
      expect(res.body.result).toBe("ignored");
      expect(await eventRow(event.id)).toMatchObject({ status: "ignored", livemode: true });
      expect(await entries()).toEqual([]);
      expect(stripe.calls.at(-1)).not.toBe("getCheckoutSession");
    });

    it("refuses (409, recorded) a charge in a currency the ledger doesn't keep", async () => {
      const donation = stripe.oneOffDonation("JPY", 1837);
      const { event, res } = await send("checkout.session.completed", donation.sessionId);
      expect(res.status).toBe(409);
      expect(await eventRow(event.id)).toMatchObject({ status: "failed", lastError: "retry:unsupported_currency" });
      expect(await entries()).toEqual([]);
    });

    it("records but ignores event types it doesn't handle", async () => {
      const { event, res } = await send("payment_intent.created", "pi_123");
      expect(res.body.result).toBe("ignored");
      expect(await eventRow(event.id)).toMatchObject({ status: "ignored", type: "payment_intent.created" });
    });
  });

  describe("monthly donations", () => {
    it("records the subscription at checkout and one monthly entry per paid invoice", async () => {
      const monthly = stripe.monthlyDonation("EUR", 1000);
      const completed = await send("checkout.session.completed", monthly.sessionId);
      expect(completed.res.body.result).toBe("processed");
      expect(await entries()).toEqual([]); // the charge comes with invoice.paid
      expect(await t.db.select().from(stripeSubscriptions)).toEqual([
        expect.objectContaining({ id: monthly.subscriptionId, status: "active", currency: "EUR", amount: 1000, canceledAt: null }),
      ]);
      expect(revalidation.revalidate).toHaveBeenCalledTimes(1); // Monthly donors changed

      await send("invoice.paid", monthly.invoiceId);
      const next = stripe.monthlyCharge(monthly.subscriptionId);
      await send("invoice.paid", next.invoiceId);

      const rows = await entries();
      expect(rows.map((entry) => [entry.entryType, entry.cadence, entry.recurrenceId, entry.grossAmount, entry.feeAmount])).toEqual([
        ["donation", "monthly", monthly.subscriptionId, 1000, cardFee(1000)],
        ["donation", "monthly", monthly.subscriptionId, 1000, cardFee(1000)],
      ]);
    });

    it("handles invoice.paid arriving before the Checkout completion", async () => {
      const monthly = stripe.monthlyDonation("CHF", 2000);
      expect((await send("invoice.paid", monthly.invoiceId)).res.body.result).toBe("processed");
      expect((await send("checkout.session.completed", monthly.sessionId)).res.body.result).toBe("processed");
      expect((await send("customer.subscription.created", monthly.subscriptionId)).res.body.result).toBe("processed");
      expect(await entries()).toHaveLength(1);
      expect(await t.db.select().from(stripeSubscriptions)).toHaveLength(1);
    });

    it("tracks cancellation, which updates Monthly donors", async () => {
      const monthly = stripe.monthlyDonation("USD", 500);
      await send("customer.subscription.created", monthly.subscriptionId);
      expect((await request(t.app.getHttpServer()).get("/api/treasury/summary?currency=USD")).body.monthlyDonors).toBe(1);

      Object.assign(stripe.subscriptions.get(monthly.subscriptionId)!, { status: "canceled", canceledAt: new Date("2026-11-01T00:00:00Z") });
      await send("customer.subscription.deleted", monthly.subscriptionId);
      expect(await t.db.select({ status: stripeSubscriptions.status, canceledAt: stripeSubscriptions.canceledAt }).from(stripeSubscriptions)).toEqual([
        { status: "canceled", canceledAt: new Date("2026-11-01T00:00:00Z") },
      ]);
      expect((await request(t.app.getHttpServer()).get("/api/treasury/summary?currency=USD")).body.monthlyDonors).toBe(0);
    });

    it("ignores subscriptions and invoices that aren't donations", async () => {
      const monthly = stripe.monthlyDonation("EUR", 1000);
      stripe.subscriptions.get(monthly.subscriptionId)!.donation = false;
      stripe.invoices.get(monthly.invoiceId)!.donation = false;
      expect((await send("customer.subscription.updated", monthly.subscriptionId)).res.body.result).toBe("ignored");
      expect((await send("invoice.paid", monthly.invoiceId)).res.body.result).toBe("ignored");
      expect(await entries()).toEqual([]);
    });
  });

  describe("refunds", () => {
    it("records a partial then a full refund as linked negative entries, once each", async () => {
      const donation = stripe.oneOffDonation("EUR", 1000);
      await send("checkout.session.completed", donation.sessionId);
      const [donationEntry] = await entries();

      const partial = stripe.refund(donation.chargeId, 300);
      await send("charge.refunded", donation.chargeId);
      const rest = stripe.refund(donation.chargeId, 700);
      await send("charge.refunded", donation.chargeId);
      // A redelivery of the first refund event changes nothing.
      await send("charge.refunded", donation.chargeId);

      const refunds = (await entries()).filter((entry) => entry.entryType === "refund");
      expect(refunds.map((entry) => [entry.externalTransactionId, entry.grossAmount, entry.feeAmount, entry.netAmount, entry.adjustsEntryId])).toEqual([
        [partial, -300, 0, -300, donationEntry!.id],
        [rest, -700, 0, -700, donationEntry!.id],
      ]);
      expect(refunds[0]).toMatchObject({ name: "Donation refund", publicDescription: "Refunded donation", publicationStatus: "published", reviewStatusKey: "not_required", occurredOn: "2026-10-16" });

      const summary = (await request(t.app.getHttpServer()).get("/api/treasury/summary?currency=EUR")).body;
      // Fully refunded: no longer counted, nothing left in the total.
      expect(summary).toMatchObject({ totalDonated: 0, donationCount: 0, medianDonation: null });
    });

    it("records only refunds that succeeded", async () => {
      const donation = stripe.oneOffDonation("EUR", 1000);
      await send("checkout.session.completed", donation.sessionId);
      stripe.refund(donation.chargeId, 400, "pending");
      await send("charge.refunded", donation.chargeId);
      expect((await entries()).filter((entry) => entry.entryType === "refund")).toEqual([]);
    });

    it("handles a refund arriving before the donation's own event (out of order)", async () => {
      const donation = stripe.oneOffDonation("USD", 2000);
      stripe.refund(donation.chargeId, 2000);
      expect((await send("charge.refunded", donation.chargeId)).res.body.result).toBe("processed");
      expect((await send("checkout.session.completed", donation.sessionId)).res.body.result).toBe("processed");

      const rows = await entries();
      expect(rows.map((entry) => [entry.entryType, entry.grossAmount])).toEqual([
        ["donation", 2000],
        ["refund", -2000],
      ]);
      expect(rows[1]!.adjustsEntryId).toBe(rows[0]!.id);
    });

    it("waits (409) for a refunded charge that isn't known to be a donation yet", async () => {
      const monthly = stripe.monthlyDonation("EUR", 1000);
      const { chargeId } = stripe.monthlyCharge(monthly.subscriptionId);
      stripe.refund(chargeId, 1000);
      // A subscription charge carries no donation marker itself: only its invoice does.
      const early = await send("charge.refunded", chargeId);
      expect(early.res.status).toBe(409);
      expect((await eventRow(early.event.id)).lastError).toBe("retry:donation_not_recorded");

      const invoiceId = [...stripe.invoices.entries()].find(([, invoice]) => invoice.charge?.id === chargeId)![0];
      await send("invoice.paid", invoiceId);
      const retry = await deliver(signedEvent("charge.refunded", chargeId, { id: early.event.id }));
      expect(retry.body.result).toBe("processed");
      expect((await entries()).map((entry) => [entry.entryType, entry.cadence, entry.grossAmount])).toEqual([
        ["donation", "monthly", 1000],
        ["refund", "one_off", -1000],
      ]);
    });
  });

  describe("late fees", () => {
    it("fills fee and net once Stripe has settled the charge, never overwriting known amounts", async () => {
      const reconciliation = t.app.get(StripeFeeReconciliationService);
      const late = stripe.oneOffDonation("EUR", 1000, { settled: false });
      const known = stripe.oneOffDonation("EUR", 2000);
      await send("checkout.session.completed", late.sessionId);
      await send("checkout.session.completed", known.sessionId);
      expect((await entries()).map((entry) => entry.feeAmount)).toEqual([null, cardFee(2000)]);
      revalidation.revalidate.mockClear();

      // Not settled yet: checked, nothing filled, nothing revalidated.
      expect(await reconciliation.reconcile()).toEqual({ checked: 1, filled: 0 });
      expect(revalidation.revalidate).not.toHaveBeenCalled();

      stripe.charges.get(late.chargeId)!.balance = stripe.balance("EUR", 1000);
      // Even if Stripe now reported other figures for the known one, it stays as recorded.
      stripe.charges.get(known.chargeId)!.balance = stripe.balance("EUR", 2000, 1);
      expect(await reconciliation.reconcile()).toEqual({ checked: 1, filled: 1 });
      expect((await entries()).map((entry) => [entry.feeAmount, entry.netAmount])).toEqual([
        [cardFee(1000), 1000 - cardFee(1000)],
        [cardFee(2000), 2000 - cardFee(2000)],
      ]);
      expect(revalidation.revalidate).toHaveBeenCalledExactlyOnceWith(["treasury"]);
      expect(await reconciliation.reconcile()).toEqual({ checked: 0, filled: 0 });
    });

    it("keeps going when Stripe fails for one entry", async () => {
      const reconciliation = t.app.get(StripeFeeReconciliationService);
      const first = stripe.oneOffDonation("EUR", 1000, { settled: false });
      const second = stripe.oneOffDonation("EUR", 1500, { settled: false });
      await send("checkout.session.completed", first.sessionId);
      await send("checkout.session.completed", second.sessionId);
      stripe.charges.delete(first.chargeId); // getCharge now fails for the first
      stripe.charges.get(second.chargeId)!.balance = stripe.balance("EUR", 1500);
      expect(await reconciliation.reconcile()).toEqual({ checked: 2, filled: 1 });
    });
  });

  describe("public summary", () => {
    it("computes the donate page's figures from published entries per currency", async () => {
      for (const amount of [200, 500, 1000, 5000]) await send("checkout.session.completed", stripe.oneOffDonation("CHF", amount).sessionId);
      await send("checkout.session.completed", stripe.oneOffDonation("EUR", 9900).sessionId);
      const monthly = stripe.monthlyDonation("CHF", 2000);
      await send("invoice.paid", monthly.invoiceId);

      const res = await request(t.app.getHttpServer()).get("/api/treasury/summary?currency=CHF").expect(200);
      expect(res.body).toEqual({
        currency: "CHF",
        totalDonated: 200 + 500 + 1000 + 5000 + 2000,
        donationCount: 5,
        medianDonation: 1000,
        monthlyDonors: 1,
        lastEntryAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      });
      // Unpublished rows never count.
      await t.db.update(treasuryEntries).set({ publicationStatus: "unpublished", publishedAt: null }).where(eq(treasuryEntries.currency, "CHF"));
      expect((await request(t.app.getHttpServer()).get("/api/treasury/summary?currency=CHF")).body).toMatchObject({ totalDonated: 0, donationCount: 0, medianDonation: null });
    });
  });

  describe("statistics after refunds", () => {
    it("excludes fully refunded donations and counts partial refunds at their net remaining amount", async () => {
      const kept = stripe.oneOffDonation("EUR", 1000);
      const partial = stripe.oneOffDonation("EUR", 2000);
      const full = stripe.oneOffDonation("EUR", 3000);
      for (const donation of [kept, partial, full]) await send("checkout.session.completed", donation.sessionId);
      stripe.refund(partial.chargeId, 500);
      await send("charge.refunded", partial.chargeId);
      stripe.refund(full.chargeId, 3000);
      await send("charge.refunded", full.chargeId);

      const res = await request(t.app.getHttpServer()).get("/api/treasury/summary?currency=EUR").expect(200);
      // Remaining: 1000 and 1500 (3000 is gone): two donations, median 1250, total 2500.
      expect(res.body).toMatchObject({ totalDonated: 2500, donationCount: 2, medianDonation: 1250 });
    });
  });

  describe("disputes", () => {
    it("records the withdrawal as a negative 'Payment disputed' entry and the reinstatement as a positive 'Dispute won', once each", async () => {
      const donation = stripe.oneOffDonation("EUR", 1000);
      await send("checkout.session.completed", donation.sessionId);
      const disputeId = stripe.dispute(donation.chargeId, 1000, { fee: 1500 });

      const withdrawn = await send("charge.dispute.funds_withdrawn", disputeId);
      expect(withdrawn.res.body.result).toBe("processed");
      // Redelivery: nothing more.
      expect((await deliver(signedEvent("charge.dispute.funds_withdrawn", disputeId, { id: withdrawn.event.id }))).body.result).toBe("duplicate");
      // Another event for the same withdrawal (e.g. charge.dispute.funds_withdrawn re-sent with a new id): still one entry.
      await send("charge.dispute.funds_withdrawn", disputeId);

      let summary = (await request(t.app.getHttpServer()).get("/api/treasury/summary?currency=EUR")).body;
      expect(summary).toMatchObject({ totalDonated: 0, donationCount: 0 });

      stripe.winDispute(disputeId);
      await send("charge.dispute.funds_reinstated", disputeId);
      const rows = await entries();
      const [donationRow] = rows;
      expect(rows.slice(1).map((entry) => [entry.entryType, entry.name, entry.publicDescription, entry.grossAmount, entry.feeAmount, entry.netAmount, entry.adjustsEntryId])).toEqual([
        ["dispute", "Payment disputed", "Payment disputed", -1000, 1500, -2500, donationRow!.id],
        ["dispute", "Dispute won", "Dispute won", 1000, -1500, 2500, donationRow!.id],
      ]);
      expect(rows[1]).toMatchObject({ source: "stripe", managedBy: "native", livemode: false, reviewStatusKey: "not_required", publicationStatus: "published", externalTransactionId: expect.stringMatching(/^txn_/) });

      summary = (await request(t.app.getHttpServer()).get("/api/treasury/summary?currency=EUR")).body;
      expect(summary).toMatchObject({ totalDonated: 1000, donationCount: 1, medianDonation: 1000 });
    });

    it("keeps Stripe's settlement figures for a dispute on a donation in another currency", async () => {
      const donation = stripe.oneOffDonation("USD", 2000);
      await send("checkout.session.completed", donation.sessionId);
      const disputeId = stripe.dispute(donation.chargeId, 2000, { fee: 1500, settle: { currency: "EUR", amount: 1840, exchangeRate: 0.92 } });
      await send("charge.dispute.funds_withdrawn", disputeId);
      expect((await entries())[1]).toMatchObject({
        entryType: "dispute",
        currency: "USD",
        grossAmount: -2000,
        feeAmount: null,
        settlementCurrency: "EUR",
        settlementGrossAmount: -1840,
        settlementFeeAmount: 1500,
        settlementNetAmount: -3340,
        exchangeRate: "0.92000000",
      });
    });

    it("handles a dispute arriving before the donation's own event, and waits on a charge that isn't ours", async () => {
      const donation = stripe.oneOffDonation("CHF", 5000);
      const disputeId = stripe.dispute(donation.chargeId, 5000);
      expect((await send("charge.dispute.funds_withdrawn", disputeId)).res.body.result).toBe("processed");
      await send("checkout.session.completed", donation.sessionId);
      expect((await entries()).map((entry) => [entry.entryType, entry.grossAmount])).toEqual([
        ["donation", 5000],
        ["dispute", -5000],
      ]);

      const other = stripe.oneOffDonation("EUR", 1000, { donation: false });
      const otherDispute = stripe.dispute(other.chargeId, 1000);
      const waiting = await send("charge.dispute.funds_withdrawn", otherDispute);
      expect(waiting.res.status).toBe(409);
      expect((await eventRow(waiting.event.id)).lastError).toBe("retry:donation_not_recorded");
    });
  });

  describe("Stripe mode", () => {
    it("marks every entry and subscription with the event's mode", async () => {
      const monthly = stripe.monthlyDonation("EUR", 1000);
      await send("invoice.paid", monthly.invoiceId);
      expect((await entries()).map((entry) => entry.livemode)).toEqual([false]);
      expect((await t.db.select({ livemode: stripeSubscriptions.livemode }).from(stripeSubscriptions))[0]!.livemode).toBe(false);
    });
  });
});

describe("Treasury figures in production show live entries only", () => {
  let t: TestApp;
  const stripe = new FakeStripe();

  beforeAll(async () => {
    // A test key on a production server (the sandbox phase): test rows are recorded but never public.
    t = await createTestApp({ NODE_ENV: "production", ADMIN_ALLOWED_ORIGINS: "https://globalexperiment.org", JOBS_DRIVER: "inprocess" }, [
      { provide: STRIPE_GATEWAY, useValue: stripe },
      { provide: RevalidationService, useValue: { revalidate: vi.fn(async () => true) } },
    ]);
  });
  afterAll(async () => {
    await t.close();
  });

  it("records test-mode donations (livemode = false) but leaves them out of every public figure", async () => {
    const donation = stripe.oneOffDonation("EUR", 1000);
    const monthly = stripe.monthlyDonation("EUR", 500);
    for (const [type, id] of [["checkout.session.completed", donation.sessionId], ["invoice.paid", monthly.invoiceId], ["customer.subscription.created", monthly.subscriptionId]] as const) {
      const event = signedEvent(type, id);
      const res = await request(t.app.getHttpServer()).post("/api/stripe/webhook").set("content-type", "application/json").set("stripe-signature", event.header).send(event.payload);
      expect(res.body.result).toBe("processed");
    }
    expect((await t.db.select({ livemode: treasuryEntries.livemode }).from(treasuryEntries)).map((row) => row.livemode)).toEqual([false, false]);
    const summary = (await request(t.app.getHttpServer()).get("/api/treasury/summary?currency=EUR").expect(200)).body;
    expect(summary).toEqual({ currency: "EUR", totalDonated: 0, donationCount: 0, medianDonation: null, monthlyDonors: 0, lastEntryAt: null });
  });
});
