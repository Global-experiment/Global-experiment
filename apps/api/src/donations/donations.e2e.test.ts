import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ProviderUnavailableError } from "../common/errors/api-error.js";
import { settings } from "../settings/settings.schema.js";
import { STRIPE_GATEWAY } from "../stripe/stripe.gateway.js";
import { FakeStripe } from "../testing/fake-stripe.js";
import { createTestApp, TEST_ORIGIN, type TestApp } from "../testing/test-app.js";

/** A distinct client address per call (behind one trusted proxy hop, as in production). */
let clientCounter = 0;
const nextClient = () => `198.51.100.${(clientCounter++ % 250) + 1}`;

const checkoutBody = (values: Record<string, unknown> = {}) => ({
  amount: "10",
  currency: "EUR",
  frequency: "once",
  method: "card",
  attemptId: randomUUID(),
  ...values,
});

describe("donations API (HTTP, Stripe test double)", () => {
  let t: TestApp;
  const stripe = new FakeStripe();
  const http = () => request(t.app.getHttpServer());
  const checkout = (body: Record<string, unknown>, origin: string | null = TEST_ORIGIN) => {
    const call = http().post("/api/donations/checkout").set("x-forwarded-for", nextClient()).send(body);
    return origin === null ? call : call.set("origin", origin);
  };

  beforeAll(async () => {
    t = await createTestApp({ TRUST_PROXY_HOPS: "1", DONATIONS_ENABLED: "true", PUBLIC_SITE_URL: TEST_ORIGIN, STRIPE_CUSTOMER_PORTAL_URL: "https://billing.stripe.com/p/login/test_portal" }, [
      { provide: STRIPE_GATEWAY, useValue: stripe },
    ]);
  });
  afterAll(async () => {
    await t.close();
  });
  beforeEach(() => {
    stripe.createdSessions.length = 0;
    stripe.unavailable = null;
  });
  afterEach(async () => {
    await t.db.delete(settings);
  });

  const setSetting = (key: string, value: unknown) => t.db.insert(settings).values({ key, value });

  describe("GET /api/donations/config", () => {
    it("serves the decided rules with the environment defaults (no settings rows)", async () => {
      const res = await http().get("/api/donations/config").expect(200);
      expect(res.body).toEqual({
        available: true,
        enabled: true,
        currencies: ["EUR", "USD", "CHF"],
        defaultCurrency: "USD",
        presets: [2, 5, 10, 20, 50],
        minimum: 1,
        maximum: 10000,
        monthly: false,
        // No publishable key configured here: card donations open Checkout.
        checkout: "hosted",
        publishableKey: null,
        methods: [
          { key: "card", currencies: ["EUR", "USD", "CHF"], frequencies: ["once"] },
          { key: "apple_pay", currencies: ["EUR", "USD", "CHF"], frequencies: ["once"] },
          { key: "google_pay", currencies: ["EUR", "USD", "CHF"], frequencies: ["once"] },
        ],
        // Only offered while monthly donations are on.
        customerPortalUrl: null,
      });
    });

    it("lets settings rows override the environment, and ignores a malformed one", async () => {
      await setSetting("donations.monthly", true);
      await setSetting("donations.extra_methods", true);
      await setSetting("donations.default_currency", "CHF");
      const on = (await http().get("/api/donations/config").expect(200)).body;
      expect(on.monthly).toBe(true);
      expect(on.defaultCurrency).toBe("CHF");
      expect(on.customerPortalUrl).toBe("https://billing.stripe.com/p/login/test_portal");
      expect(on.methods).toEqual([
        { key: "card", currencies: ["EUR", "USD", "CHF"], frequencies: ["once", "monthly"] },
        { key: "apple_pay", currencies: ["EUR", "USD", "CHF"], frequencies: ["once", "monthly"] },
        { key: "google_pay", currencies: ["EUR", "USD", "CHF"], frequencies: ["once", "monthly"] },
        { key: "paypal", currencies: ["EUR", "USD", "CHF"], frequencies: ["once"] },
        { key: "sepa_debit", currencies: ["EUR"], frequencies: ["once", "monthly"] },
      ]);
      // PayPal monthly behind its own setting (Stripe allows it once PayPal recurring payments are on).
      await setSetting("donations.paypal_monthly", true);
      const paypal = (await http().get("/api/donations/config").expect(200)).body.methods.find((method: { key: string }) => method.key === "paypal");
      expect(paypal.frequencies).toEqual(["once", "monthly"]);

      await t.db.delete(settings);
      await setSetting("donations.default_currency", "GBP"); // not a currency we take
      await setSetting("donations.monthly", "yes"); // not a boolean
      const fallback = (await http().get("/api/donations/config").expect(200)).body;
      expect(fallback.defaultCurrency).toBe("USD");
      expect(fallback.monthly).toBe(false);
    });

    it("is public and cache-safe: no cookies, no secrets", async () => {
      const res = await http().get("/api/donations/config").expect(200);
      expect(res.headers["set-cookie"]).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toMatch(/sk_|whsec_|rk_/);
    });
  });

  describe("POST /api/donations/checkout", () => {
    it("creates a one-off Checkout session with the chosen amount, currency and return URLs", async () => {
      const res = await checkout(checkoutBody({ amount: "12,50", currency: "CHF" })).expect(201);
      expect(stripe.createdSessions).toHaveLength(1);
      const session = stripe.createdSessions[0]!;
      expect(res.body).toEqual({ url: `https://checkout.stripe.com/c/pay/${session.id}` });
      expect(session).toMatchObject({
        mode: "payment",
        currency: "CHF",
        amount: 1250,
        paymentMethodTypes: ["card"],
        productName: "Donation to the Global Experiment",
        // Success keeps the choice and carries Stripe's placeholder unencoded.
        successUrl: `${TEST_ORIGIN}/donate/thank-you?currency=CHF&amount=12.50&frequency=once&session_id={CHECKOUT_SESSION_ID}`,
        // Cancel returns to the donate page with the same currency and amount.
        cancelUrl: `${TEST_ORIGIN}/donate?currency=CHF&amount=12.50&frequency=once&canceled=1`,
      });
      expect(session.idempotencyKey).toMatch(/^donation-checkout:[0-9a-f-]{36}:[0-9a-f]{16}$/);
    });

    it("keeps whole amounts whole in the return URLs", async () => {
      await checkout(checkoutBody({ amount: "50", currency: "USD" })).expect(201);
      expect(stripe.createdSessions[0]!.cancelUrl).toBe(`${TEST_ORIGIN}/donate?currency=USD&amount=50&frequency=once&canceled=1`);
    });

    it("creates a subscription session for monthly donations when the flag is on", async () => {
      await checkout(checkoutBody({ frequency: "monthly" })).expect(400);
      expect(stripe.createdSessions).toHaveLength(0);

      await setSetting("donations.monthly", true);
      await checkout(checkoutBody({ frequency: "monthly", amount: "20" })).expect(201);
      expect(stripe.createdSessions[0]).toMatchObject({
        mode: "subscription",
        amount: 2000,
        productName: "Monthly donation to the Global Experiment",
        successUrl: expect.stringContaining("frequency=monthly"),
      });
    });

    it("maps wallets to card Checkout, and PayPal/SEPA to their own methods behind the flag", async () => {
      await checkout(checkoutBody({ method: "apple_pay" })).expect(201);
      await checkout(checkoutBody({ method: "google_pay" })).expect(201);
      expect(stripe.createdSessions.map((session) => session.paymentMethodTypes)).toEqual([["card"], ["card"]]);

      for (const method of ["paypal", "sepa_debit"]) {
        const refused = await checkout(checkoutBody({ method })).expect(400);
        expect(refused.body.error.details.issues).toEqual([{ path: "method", message: "This payment method is not available." }]);
      }
      await setSetting("donations.extra_methods", true);
      await checkout(checkoutBody({ method: "paypal", currency: "USD" })).expect(201);
      await checkout(checkoutBody({ method: "sepa_debit", currency: "EUR" })).expect(201);
      expect(stripe.createdSessions.slice(2).map((session) => session.paymentMethodTypes)).toEqual([["paypal"], ["sepa_debit"]]);

      const sepaUsd = await checkout(checkoutBody({ method: "sepa_debit", currency: "USD" })).expect(400);
      expect(sepaUsd.body.error.details.issues).toEqual([{ path: "method", message: "This payment method is not available in USD." }]);
    });

    it("validates the amount: format, minimum 1, maximum 10,000", async () => {
      const issues = async (amount: string) => (await checkout(checkoutBody({ amount })).expect(400)).body.error.details.issues;
      expect(await issues("0.50")).toEqual([{ path: "amount", message: "The minimum donation is 1 EUR." }]);
      expect(await issues("10000.01")).toEqual([{ path: "amount", message: "The maximum donation is 10,000 EUR." }]);
      expect(await issues("abc")).toEqual([{ path: "amount", message: "Enter an amount with at most two decimals." }]);
      await checkout(checkoutBody({ amount: "1" })).expect(201);
      await checkout(checkoutBody({ amount: "10000" })).expect(201);
      expect(stripe.createdSessions.map((session) => session.amount)).toEqual([100, 1_000_000]);
    });

    it("refuses malformed requests before anything reaches Stripe", async () => {
      for (const body of [
        checkoutBody({ currency: "GBP" }),
        checkoutBody({ frequency: "yearly" }),
        checkoutBody({ method: "bitcoin" }),
        checkoutBody({ attemptId: "not-a-uuid" }),
        checkoutBody({ amount: 10 }),
        { ...checkoutBody(), email: "donor@example.test" }, // never accepts donor data
        {},
      ]) {
        const res = await checkout(body);
        expect(res.status, JSON.stringify(body)).toBe(400);
        expect(res.body.error.code).toBe("validation_failed");
      }
      expect(stripe.createdSessions).toHaveLength(0);
    });

    it("accepts the public site's origin only", async () => {
      await checkout(checkoutBody(), "https://evil.example").expect(403);
      await checkout(checkoutBody(), null).expect(403);
      await checkout(checkoutBody(), "null").expect(403);
      expect(stripe.createdSessions).toHaveLength(0);
    });

    it("opens the same Checkout for a repeated attempt (idempotency key), a new one for a new choice", async () => {
      const body = checkoutBody();
      const first = await checkout(body).expect(201);
      const again = await checkout(body).expect(201);
      expect(again.body.url).toBe(first.body.url);
      expect(stripe.createdSessions).toHaveLength(1);

      // Same attempt, different amount: a different key (Stripe would reject reusing one with other params).
      const changed = await checkout({ ...body, amount: "20" }).expect(201);
      expect(changed.body.url).not.toBe(first.body.url);
      expect(stripe.createdSessions).toHaveLength(2);
      expect(stripe.createdSessions[0]!.idempotencyKey).not.toBe(stripe.createdSessions[1]!.idempotencyKey);
    });

    it("answers 502 in the uniform shape when Stripe is unavailable, without provider details", async () => {
      stripe.unavailable = new ProviderUnavailableError("Stripe", { cause: new Error("connect ECONNREFUSED api.stripe.com secret-detail") });
      const res = await checkout(checkoutBody()).expect(502);
      expect(res.body.error.code).toBe("provider_unavailable");
      expect(JSON.stringify(res.body)).not.toMatch(/ECONNREFUSED|secret-detail/);
    });
  });

  describe("GET /api/donations/checkout/:sessionId", () => {
    it("reports a completed donation session for the thank-you page", async () => {
      const { sessionId } = stripe.oneOffDonation("EUR", 1000);
      const res = await http().get(`/api/donations/checkout/${sessionId}`).expect(200);
      expect(res.body).toEqual({ status: "complete", paymentStatus: "paid", frequency: "once" });

      const monthly = stripe.monthlyDonation("USD", 500);
      expect((await http().get(`/api/donations/checkout/${monthly.sessionId}`).expect(200)).body.frequency).toBe("monthly");
    });

    it("answers 404 for malformed ids, unknown sessions and payments that aren't donations", async () => {
      await http().get("/api/donations/checkout/not-a-session").expect(404);
      await http().get("/api/donations/checkout/cs_test_doesnotexist0000").expect(404);
      const other = stripe.oneOffDonation("EUR", 1000, { donation: false });
      await http().get(`/api/donations/checkout/${other.sessionId}`).expect(404);
    });
  });

  describe("GET /api/treasury/summary", () => {
    it("starts empty and validates the currency", async () => {
      const res = await http().get("/api/treasury/summary?currency=EUR").expect(200);
      expect(res.body).toEqual({ currency: "EUR", totalDonated: 0, donationCount: 0, medianDonation: null, monthlyDonors: 0, lastEntryAt: null });
      await http().get("/api/treasury/summary?currency=GBP").expect(400);
      await http().get("/api/treasury/summary").expect(400);
    });
  });
});

describe("donations API without Stripe configured", () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  it("says donations are unavailable instead of failing", async () => {
    const config = await request(t.app.getHttpServer()).get("/api/donations/config").expect(200);
    expect(config.body.available).toBe(false);
    const res = await request(t.app.getHttpServer()).post("/api/donations/checkout").set("origin", TEST_ORIGIN).send(checkoutBody()).expect(502);
    expect(res.body.error.code).toBe("provider_unavailable");
    await request(t.app.getHttpServer()).post("/api/stripe/webhook").set("stripe-signature", "t=1,v1=x").send("{}").expect(502);
  });
});

describe("checkout rate limit", () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp({ TRUST_PROXY_HOPS: "1", DONATIONS_ENABLED: "true" }, [{ provide: STRIPE_GATEWAY, useValue: new FakeStripe() }]);
  });
  afterAll(async () => {
    await t.close();
  });

  it("allows 10 Checkout attempts a minute per client, then answers 429", async () => {
    const attempt = (client: string) =>
      request(t.app.getHttpServer()).post("/api/donations/checkout").set("origin", TEST_ORIGIN).set("x-forwarded-for", client).send(checkoutBody());
    for (let index = 0; index < 10; index++) await attempt("203.0.113.7").expect(201);
    const limited = await attempt("203.0.113.7");
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe("rate_limited");
    // Another donor is unaffected.
    await attempt("203.0.113.8").expect(201);
  });
});

describe("donations closed (donations.enabled off) and the private preview", () => {
  const PREVIEW = "preview-token-for-tests-only-0123456789";
  let t: TestApp;
  const stripe = new FakeStripe();
  beforeAll(async () => {
    t = await createTestApp({ DONATIONS_PREVIEW_TOKEN: PREVIEW }, [{ provide: STRIPE_GATEWAY, useValue: stripe }]);
  });
  afterAll(async () => {
    await t.close();
  });
  const http = () => request(t.app.getHttpServer());
  const checkout = (body: Record<string, unknown>) => http().post("/api/donations/checkout").set("origin", TEST_ORIGIN).send(body);

  it("is closed by default: the config says so and Checkout is refused, nothing reaches Stripe", async () => {
    expect((await http().get("/api/donations/config").expect(200)).body.enabled).toBe(false);
    const refused = await checkout(checkoutBody()).expect(403);
    expect(refused.body.error).toMatchObject({ code: "forbidden", details: { reason: "donations_closed" } });
    expect(stripe.createdSessions).toHaveLength(0);
  });

  it("opens for the preview token only (header for the config, body for Checkout)", async () => {
    expect((await http().get("/api/donations/config").set("x-donations-preview", PREVIEW).expect(200)).body.enabled).toBe(true);
    expect((await http().get("/api/donations/config").set("x-donations-preview", "wrong-token").expect(200)).body.enabled).toBe(false);
    await checkout(checkoutBody({ previewToken: "wrong-token" })).expect(403);
    await checkout(checkoutBody({ previewToken: PREVIEW })).expect(201);
    expect(stripe.createdSessions).toHaveLength(1);
    // The token never travels to Stripe.
    expect(JSON.stringify(stripe.createdSessions[0])).not.toContain(PREVIEW);
  });

  it("opens for everyone once the donations.enabled setting is on", async () => {
    await t.db.insert(settings).values({ key: "donations.enabled", value: true });
    expect((await http().get("/api/donations/config").expect(200)).body.enabled).toBe(true);
    await checkout(checkoutBody()).expect(201);
    await t.db.delete(settings);
  });
});

describe("donations closed without a preview token configured", () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp({}, [{ provide: STRIPE_GATEWAY, useValue: new FakeStripe() }]);
  });
  afterAll(async () => {
    await t.close();
  });

  it("never treats a token as valid", async () => {
    expect((await request(t.app.getHttpServer()).get("/api/donations/config").set("x-donations-preview", "anything").expect(200)).body.enabled).toBe(false);
    await request(t.app.getHttpServer()).post("/api/donations/checkout").set("origin", TEST_ORIGIN).send(checkoutBody({ previewToken: "" })).expect(403);
  });
});

/**
 * One-off card donations paid on the donate page (decided 2026-10-19):
 * Stripe's card fields, no email; donations.checkout = embedded, which needs
 * a publishable key. Its own app: on a real PostgreSQL server every test
 * app resets the shared _test database.
 */
describe("embedded card donations (PaymentIntent)", () => {
  let t: TestApp;
  const stripe = new FakeStripe();
  const http = () => request(t.app.getHttpServer());
  const intent = (body: Record<string, unknown>) => http().post("/api/donations/payment-intent").set("x-forwarded-for", nextClient()).set("origin", TEST_ORIGIN).send(body);
  const attempt = () => ({ amount: "20", currency: "USD", attemptId: randomUUID() });

  beforeAll(async () => {
    t = await createTestApp({ TRUST_PROXY_HOPS: "1", DONATIONS_ENABLED: "true", PUBLIC_SITE_URL: TEST_ORIGIN, STRIPE_PUBLISHABLE_KEY: "pk_test_FAKEKEYforapitestsonly" }, [
      { provide: STRIPE_GATEWAY, useValue: stripe },
    ]);
  });
  afterAll(async () => {
    await t.close();
  });
  afterEach(async () => {
    stripe.createdIntents.length = 0;
    await t.db.delete(settings);
  });

  it("offers the embedded card form with the publishable key; donations.checkout = hosted turns it off", async () => {
    expect((await http().get("/api/donations/config").expect(200)).body).toMatchObject({ checkout: "embedded", publishableKey: "pk_test_FAKEKEYforapitestsonly" });
    await t.db.insert(settings).values({ key: "donations.checkout", value: "hosted" });
    expect((await http().get("/api/donations/config").expect(200)).body).toMatchObject({ checkout: "hosted", publishableKey: null });
    const refused = await intent(attempt()).expect(403);
    expect(refused.body.error.details).toEqual({ reason: "embedded_checkout_off" });
  });

  it("creates a card-only PaymentIntent for the amount and currency, and returns a reference instead of an email receipt", async () => {
    const res = await intent({ amount: "12.50", currency: "EUR", attemptId: randomUUID() }).expect(201);
    expect(stripe.createdIntents).toHaveLength(1);
    expect(stripe.createdIntents[0]).toMatchObject({ amount: 1250, currency: "EUR", description: "Donation to the Global Experiment" });
    expect(res.body.clientSecret).toMatch(/^pi_.+_secret_fake$/);
    expect(res.body.reference).toMatch(/^GE-[A-Z0-9]{8}$/);
    expect(Object.keys(res.body).sort()).toEqual(["clientSecret", "reference"]);
  });

  it("applies the same rules as Checkout and only answers the public site", async () => {
    await intent({ ...attempt(), amount: "0.50" }).expect(400);
    await intent({ ...attempt(), amount: "10000.01" }).expect(400);
    await intent({ ...attempt(), currency: "GBP" }).expect(400);
    await intent({ ...attempt(), frequency: "monthly" }).expect(400);
    await http().post("/api/donations/payment-intent").set("x-forwarded-for", nextClient()).set("origin", "https://evil.example").send(attempt()).expect(403);
    expect(stripe.createdIntents).toHaveLength(0);
  });

  it("returns the same PaymentIntent for a repeated attempt (idempotency key)", async () => {
    const body = attempt();
    const first = await intent(body).expect(201);
    const second = await intent(body).expect(201);
    expect(second.body.clientSecret).toBe(first.body.clientSecret);
    expect(stripe.createdIntents).toHaveLength(1);
  });

  it("reports an embedded payment's status for the thank-you page; 404 for anything else", async () => {
    const paid = stripe.embeddedDonation("USD", 2000);
    const res = await http().get(`/api/donations/payment-intents/${paid.intentId}`).expect(200);
    expect(res.body).toEqual({ status: "succeeded", amount: 2000, currency: "USD", reference: `GE-${paid.intentId.slice(-8).toUpperCase()}` });
    await http().get("/api/donations/payment-intents/not-an-intent").expect(404);
    await http().get("/api/donations/payment-intents/pi_doesnotexist000000").expect(404);
    const checkout = stripe.oneOffDonation("USD", 2000);
    await http().get(`/api/donations/payment-intents/${checkout.intentId}`).expect(404);
    const foreign = stripe.embeddedDonation("USD", 2000, { donation: false });
    await http().get(`/api/donations/payment-intents/${foreign.intentId}`).expect(404);
  });
});
