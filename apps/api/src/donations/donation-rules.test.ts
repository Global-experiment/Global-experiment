import { describe, expect, it } from "vitest";
import { checkoutIssues, DONATION_RULES, methodAvailable, parseAmountToMinor, type CheckoutChoice } from "./donation-rules.js";

const ALL_ON = { monthly: true, extraMethods: true };
const ALL_OFF = { monthly: false, extraMethods: false };
const choice = (values: Partial<CheckoutChoice> = {}): CheckoutChoice => ({ amount: "10", currency: "EUR", frequency: "once", method: "card", ...values });
const paths = (values: Partial<CheckoutChoice>, flags = ALL_ON) => checkoutIssues(choice(values), flags).map((issue) => issue.path);

describe("donation rules (decided 2026-10-15)", () => {
  it("offers the presets 2 / 5 / 10 / 20 / 50, min 1, max 10,000 in EUR, USD and CHF", () => {
    expect(DONATION_RULES).toEqual({ currencies: ["EUR", "USD", "CHF"], presets: [2, 5, 10, 20, 50], minimum: 1, maximum: 10_000 });
  });

  it("parses amounts as typed into minor units, with a dot or a comma", () => {
    expect(parseAmountToMinor("10")).toBe(1000);
    expect(parseAmountToMinor(" 10.5 ")).toBe(1050);
    expect(parseAmountToMinor("10,50")).toBe(1050);
    expect(parseAmountToMinor("0.01")).toBe(1);
    expect(parseAmountToMinor("10000")).toBe(1_000_000);
    for (const bad of ["", "abc", "-5", "1e3", "10.123", "1,000.00", "10.", ".5", "12345678", "Infinity", "0x10"]) {
      expect(parseAmountToMinor(bad), bad).toBeNull();
    }
  });

  it("accepts amounts from 1 to 10,000 inclusive", () => {
    for (const ok of ["1", "1.00", "2", "50", "9999.99", "10000", "10000,00"]) expect(paths({ amount: ok }), ok).toEqual([]);
    expect(checkoutIssues(choice({ amount: "0.99" }), ALL_ON)).toEqual([{ path: "amount", message: "The minimum donation is 1 EUR." }]);
    expect(checkoutIssues(choice({ amount: "10000.01", currency: "CHF" }), ALL_ON)).toEqual([{ path: "amount", message: "The maximum donation is 10,000 CHF." }]);
    expect(paths({ amount: "ten" })).toEqual(["amount"]);
  });

  it("offers monthly only behind donations.monthly", () => {
    expect(paths({ frequency: "monthly" }, ALL_OFF)).toEqual(["frequency"]);
    expect(paths({ frequency: "monthly" }, { ...ALL_OFF, monthly: true })).toEqual([]);
  });

  it("offers PayPal and SEPA only behind donations.extra_methods; cards and wallets always", () => {
    for (const method of ["card", "apple_pay", "google_pay"] as const) expect(methodAvailable(method, ALL_OFF), method).toBe(true);
    for (const method of ["paypal", "sepa_debit"] as const) {
      expect(methodAvailable(method, ALL_OFF), method).toBe(false);
      expect(paths({ method }, ALL_OFF)).toEqual(["method"]);
      expect(paths({ method }, ALL_ON)).toEqual([]);
    }
  });

  it("offers SEPA Direct Debit in EUR only", () => {
    expect(paths({ method: "sepa_debit", currency: "EUR" })).toEqual([]);
    expect(checkoutIssues(choice({ method: "sepa_debit", currency: "USD" }), ALL_ON)).toEqual([{ path: "method", message: "This payment method is not available in USD." }]);
    expect(paths({ method: "sepa_debit", currency: "CHF" })).toEqual(["method"]);
    expect(paths({ method: "sepa_debit", frequency: "monthly" })).toEqual([]);
  });

  it("keeps PayPal one-off (recurring PayPal needs a separate Stripe approval)", () => {
    expect(paths({ method: "paypal", frequency: "monthly" })).toEqual(["method"]);
    expect(paths({ method: "paypal", currency: "CHF" })).toEqual([]);
  });

  it("reports every issue at once", () => {
    expect(paths({ amount: "0", frequency: "monthly", method: "paypal" }, ALL_OFF)).toEqual(["amount", "frequency", "method"]);
  });
});
