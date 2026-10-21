import { describe, expect, it } from "vitest";
import { EnvValidationError, parseConfig } from "./env.js";

const base = { DATABASE_URL: "postgres://fake_user@localhost:5432/fake_db" };

describe("parseConfig", () => {
  it("applies safe development defaults", () => {
    const config = parseConfig({ ...base });
    expect(config).toMatchObject({
      nodeEnv: "development",
      host: "127.0.0.1",
      port: 4000,
      cookieSecure: false,
      session: { idleMinutes: 480, maxDays: 7 },
      trustProxyHops: 0,
    });
  });

  it("requires DATABASE_URL and never echoes values in the error", () => {
    expect(() => parseConfig({ DATABASE_URL: "not-a-url-with-secret-xyz" })).toThrow(EnvValidationError);
    try {
      parseConfig({ DATABASE_URL: "not-a-url-with-secret-xyz" });
    } catch (error) {
      expect(String((error as Error).message)).toContain("DATABASE_URL");
      expect(String((error as Error).message)).not.toContain("secret-xyz");
    }
  });

  it("rejects non-postgres connection strings", () => {
    expect(() => parseConfig({ DATABASE_URL: "mysql://localhost/db" })).toThrow(EnvValidationError);
  });

  it("requires an explicit admin origin allow-list in production and forces secure cookies", () => {
    expect(() => parseConfig({ ...base, NODE_ENV: "production" })).toThrow(/ADMIN_ALLOWED_ORIGINS/);
    expect(() =>
      parseConfig({ ...base, NODE_ENV: "production", ADMIN_ALLOWED_ORIGINS: "https://globalexperiment.org", COOKIE_SECURE: "false" }),
    ).toThrow(/COOKIE_SECURE/);
    const config = parseConfig({ ...base, NODE_ENV: "production", ADMIN_ALLOWED_ORIGINS: "https://globalexperiment.org/" });
    expect(config.cookieSecure).toBe(true);
    expect(config.adminAllowedOrigins).toEqual(["https://globalexperiment.org"]);
  });
});

describe("parseConfig — Stripe and donations", () => {
  // Shape-valid fakes: never real keys.
  const TEST_KEY = "sk_test_FAKEKEYFORTESTS0000";
  const LIVE_KEY = "sk_live_FAKEKEYFORTESTS0000";
  const production = { ...base, NODE_ENV: "production", ADMIN_ALLOWED_ORIGINS: "https://globalexperiment.org" };

  it("defaults to donations off-flags, USD, no Stripe, local site and web origins", () => {
    const config = parseConfig({ ...base });
    expect(config.stripe).toEqual({ secretKey: undefined, webhookSecret: undefined, livemode: false, customerPortalUrl: undefined, feeReconcileMinutes: 15, fixture: false });
    expect(config.donationDefaults).toEqual({ enabled: false, monthly: false, extraMethods: false, defaultCurrency: "USD", paypalMonthly: false, checkout: "hosted" });
    expect(config.donationPreviewToken).toBeUndefined();
    expect(config.publicSiteUrl).toBe("http://localhost:3000");
    expect(config.revalidation).toEqual({ webUrl: "http://127.0.0.1:3000", secret: undefined });
  });

  it("reads the donation defaults from the environment", () => {
    const config = parseConfig({
      ...base,
      DONATIONS_MONTHLY: "true",
      DONATIONS_EXTRA_METHODS: "true",
      DONATIONS_DEFAULT_CURRENCY: "CHF",
      DONATIONS_PAYPAL_MONTHLY: "true",
      DONATIONS_CHECKOUT: "embedded",
    });
    expect(config.donationDefaults).toEqual({ enabled: false, monthly: true, extraMethods: true, defaultCurrency: "CHF", paypalMonthly: true, checkout: "embedded" });
    expect(() => parseConfig({ ...base, DONATIONS_CHECKOUT: "popup" })).toThrow(/DONATIONS_CHECKOUT/);
    expect(() => parseConfig({ ...base, DONATIONS_DEFAULT_CURRENCY: "GBP" })).toThrow(/DONATIONS_DEFAULT_CURRENCY/);
  });

  it("accepts test keys, refuses live keys unless explicitly enabled, never echoing them", () => {
    expect(parseConfig({ ...base, STRIPE_SECRET_KEY: TEST_KEY }).stripe.livemode).toBe(false);
    // The publishable key (embedded card form): a pk_ key in the same mode as the secret key.
    expect(parseConfig({ ...base, STRIPE_SECRET_KEY: TEST_KEY, STRIPE_PUBLISHABLE_KEY: "pk_test_FAKEKEYFORTESTS0000" }).stripe.publishableKey).toBe("pk_test_FAKEKEYFORTESTS0000");
    expect(() => parseConfig({ ...base, STRIPE_SECRET_KEY: TEST_KEY, STRIPE_PUBLISHABLE_KEY: "pk_live_FAKEKEYFORTESTS0000" })).toThrow(/STRIPE_PUBLISHABLE_KEY/);
    expect(() => parseConfig({ ...base, STRIPE_PUBLISHABLE_KEY: TEST_KEY })).toThrow(/STRIPE_PUBLISHABLE_KEY/);
    expect(() => parseConfig({ ...base, STRIPE_SECRET_KEY: LIVE_KEY })).toThrow(/STRIPE_LIVE_ENABLED/);
    try {
      parseConfig({ ...base, STRIPE_SECRET_KEY: LIVE_KEY });
    } catch (error) {
      expect(String((error as Error).message)).not.toContain("FAKEKEY");
    }
    expect(parseConfig({ ...base, STRIPE_SECRET_KEY: LIVE_KEY, STRIPE_LIVE_ENABLED: "true" }).stripe.livemode).toBe(true);
    expect(() => parseConfig({ ...base, STRIPE_SECRET_KEY: "pk_test_publishable" })).toThrow(/STRIPE_SECRET_KEY/);
    expect(() => parseConfig({ ...base, STRIPE_WEBHOOK_SECRET: "not-a-secret" })).toThrow(/STRIPE_WEBHOOK_SECRET/);
  });

  it("requires the webhook secret, site and revalidation settings in production when Stripe is on", () => {
    expect(() => parseConfig({ ...production, STRIPE_SECRET_KEY: TEST_KEY })).toThrow(/STRIPE_WEBHOOK_SECRET[\s\S]*PUBLIC_SITE_URL[\s\S]*WEB_INTERNAL_URL[\s\S]*REVALIDATE_SECRET/);
    expect(() => parseConfig({ ...base, REVALIDATE_SECRET: "too-short" })).toThrow(/REVALIDATE_SECRET/);
    const config = parseConfig({
      ...production,
      STRIPE_SECRET_KEY: TEST_KEY,
      STRIPE_WEBHOOK_SECRET: "whsec_FAKESECRET",
      PUBLIC_SITE_URL: "https://globalexperiment.org/",
      WEB_INTERNAL_URL: "http://127.0.0.1:3000",
      REVALIDATE_SECRET: "x".repeat(32),
    });
    expect(config.publicSiteUrl).toBe("https://globalexperiment.org");
    // Without Stripe, production needs none of them.
    expect(() => parseConfig(production)).not.toThrow();
  });

  it("accepts only an https customer portal link", () => {
    expect(parseConfig({ ...base, STRIPE_CUSTOMER_PORTAL_URL: "https://billing.stripe.com/p/login/test_123" }).stripe.customerPortalUrl).toBe(
      "https://billing.stripe.com/p/login/test_123",
    );
    expect(() => parseConfig({ ...base, STRIPE_CUSTOMER_PORTAL_URL: "http://billing.stripe.com/p/login/x" })).toThrow(/STRIPE_CUSTOMER_PORTAL_URL/);
  });
});

describe("parseConfig — Stripe fixture", () => {
  it("is accepted only under NODE_ENV=test", () => {
    expect(parseConfig({ ...base, NODE_ENV: "test", STRIPE_FIXTURE: "1" }).stripe.fixture).toBe(true);
    expect(() => parseConfig({ ...base, STRIPE_FIXTURE: "1" })).toThrow(/STRIPE_FIXTURE/);
    expect(parseConfig({ ...base }).stripe.fixture).toBe(false);
  });
});

describe("parseConfig — donations opening", () => {
  it("keeps donations closed by default and takes a well-formed preview token", () => {
    expect(parseConfig({ ...base, DONATIONS_ENABLED: "true" }).donationDefaults.enabled).toBe(true);
    const token = "a".repeat(40);
    expect(parseConfig({ ...base, DONATIONS_PREVIEW_TOKEN: token }).donationPreviewToken).toBe(token);
    expect(() => parseConfig({ ...base, DONATIONS_PREVIEW_TOKEN: "short" })).toThrow(/DONATIONS_PREVIEW_TOKEN/);
    expect(() => parseConfig({ ...base, DONATIONS_PREVIEW_TOKEN: "x".repeat(31) + "!" })).toThrow(/DONATIONS_PREVIEW_TOKEN/);
  });
});
