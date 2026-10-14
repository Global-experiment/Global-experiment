import { describe, expect, it } from "vitest";
import { donateHref, parseDonateParams } from "./donateParams";

const defaults = { currency: "USD" as const, monthlyEnabled: false };

describe("donate URL state", () => {
  it("defaults to the configured currency, no amount, once", () => {
    expect(parseDonateParams({}, defaults)).toEqual({ currency: "USD", amountMinor: null, frequency: "once", canceled: false, preview: null });
  });

  it("restores the choice Stripe's cancel link carries back", () => {
    expect(parseDonateParams({ currency: "CHF", amount: "12.50", frequency: "monthly", canceled: "1" }, { ...defaults, monthlyEnabled: true })).toEqual({
      currency: "CHF",
      amountMinor: 1250,
      frequency: "monthly",
      canceled: true,
      preview: null,
    });
  });

  it("is lenient with hand-edited links", () => {
    expect(parseDonateParams({ currency: "eur" }, defaults).currency).toBe("EUR");
    expect(parseDonateParams({ currency: "GBP", amount: "abc" }, defaults)).toMatchObject({ currency: "USD", amountMinor: null });
    expect(parseDonateParams({ currency: ["CHF", "EUR"] }, defaults).currency).toBe("CHF");
    // Monthly only while it's offered.
    expect(parseDonateParams({ frequency: "monthly" }, defaults).frequency).toBe("once");
  });

  it("writes the choice back, never the one-time canceled flag", () => {
    expect(donateHref({ currency: "EUR" })).toBe("/donate?currency=EUR");
    expect(donateHref({ currency: "USD", amountText: "12.50", frequency: "monthly" })).toBe("/donate?currency=USD&amount=12.50&frequency=monthly");
    expect(donateHref({ currency: "CHF", amountText: null, frequency: "once" })).toBe("/donate?currency=CHF");
    // The private preview link survives the visitor's choices.
    expect(donateHref({ currency: "EUR", amountText: "10", preview: "tok" })).toBe("/donate?currency=EUR&amount=10&preview=tok");
    expect(parseDonateParams({ preview: "tok" }, defaults).preview).toBe("tok");
  });
});
