import type { ValidationIssue } from "../common/errors/api-error.js";
import type { CheckoutMethod } from "../stripe/stripe.gateway.js";
import { TREASURY_CURRENCIES, type TreasuryCurrency } from "../treasury/treasury.schema.js";

/**
 * The donation rules decided by the client (2026-10-15, roadmap §5):
 * presets 2 / 5 / 10 / 20 / 50, minimum 1, maximum 10,000 in the chosen
 * currency; EUR, USD, CHF; monthly only behind `donations.monthly`, PayPal
 * and SEPA only behind `donations.extra_methods`; SEPA Direct Debit is EUR
 * only; PayPal monthly only behind `donations.paypal_monthly` (decided
 * 2026-10-19: Stripe allows PayPal subscriptions once PayPal recurring
 * payments are enabled on the account). Pure functions — the API enforces them, the donate page displays them.
 */
export const DONATION_RULES = {
  currencies: TREASURY_CURRENCIES,
  presets: [2, 5, 10, 20, 50],
  minimum: 1,
  maximum: 10_000,
} as const;

export type DonationFrequency = "once" | "monthly";
export type DonationMethodKey = "card" | "apple_pay" | "google_pay" | "paypal" | "sepa_debit";

interface MethodRule {
  /** What Stripe Checkout is limited to for this row (wallets are card payments in Checkout). */
  stripeType: CheckoutMethod;
  currencies: readonly TreasuryCurrency[];
  frequencies: readonly DonationFrequency[];
  /** Behind the donations.extra_methods flag. */
  extra: boolean;
}

export const DONATION_METHODS: Record<DonationMethodKey, MethodRule> = {
  card: { stripeType: "card", currencies: TREASURY_CURRENCIES, frequencies: ["once", "monthly"], extra: false },
  apple_pay: { stripeType: "card", currencies: TREASURY_CURRENCIES, frequencies: ["once", "monthly"], extra: false },
  google_pay: { stripeType: "card", currencies: TREASURY_CURRENCIES, frequencies: ["once", "monthly"], extra: false },
  // Monthly too, but only while donations.paypal_monthly is on (methodFrequencies).
  paypal: { stripeType: "paypal", currencies: TREASURY_CURRENCIES, frequencies: ["once", "monthly"], extra: true },
  sepa_debit: { stripeType: "sepa_debit", currencies: ["EUR"], frequencies: ["once", "monthly"], extra: true },
};

export const DONATION_METHOD_ORDER: readonly DonationMethodKey[] = ["card", "apple_pay", "google_pay", "paypal", "sepa_debit"];

export interface DonationFlags {
  monthly: boolean;
  extraMethods: boolean;
  paypalMonthly: boolean;
}

/** The frequencies a method offers under the current flags (monthly ones only while monthly donations are on). */
export function methodFrequencies(method: DonationMethodKey, flags: DonationFlags): readonly DonationFrequency[] {
  return DONATION_METHODS[method].frequencies.filter(
    (frequency) => frequency === "once" || (flags.monthly && (method !== "paypal" || flags.paypalMonthly)),
  );
}

/** Amount text ("10", "10.5", "10,50") → minor units, or null if it isn't a valid amount format. */
export function parseAmountToMinor(text: string): number | null {
  const match = /^(\d{1,7})(?:[.,](\d{1,2}))?$/.exec(text.trim());
  if (!match) return null;
  const cents = (match[2] ?? "").padEnd(2, "0");
  return Number(match[1]) * 100 + Number(cents);
}

export const methodAvailable = (method: DonationMethodKey, flags: DonationFlags) => !DONATION_METHODS[method].extra || flags.extraMethods;

export interface CheckoutChoice {
  amount: string;
  currency: TreasuryCurrency;
  frequency: DonationFrequency;
  method: DonationMethodKey;
}

/** Field-level issues, empty when the choice can go to Stripe. */
export function checkoutIssues(choice: CheckoutChoice, flags: DonationFlags): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const minor = parseAmountToMinor(choice.amount);
  if (minor === null) issues.push({ path: "amount", message: "Enter an amount with at most two decimals." });
  else if (minor < DONATION_RULES.minimum * 100) issues.push({ path: "amount", message: `The minimum donation is ${DONATION_RULES.minimum} ${choice.currency}.` });
  else if (minor > DONATION_RULES.maximum * 100)
    issues.push({ path: "amount", message: `The maximum donation is ${DONATION_RULES.maximum.toLocaleString("en-US")} ${choice.currency}.` });
  if (choice.frequency === "monthly" && !flags.monthly) issues.push({ path: "frequency", message: "Monthly donations are not available." });
  const method = DONATION_METHODS[choice.method];
  if (!methodAvailable(choice.method, flags)) issues.push({ path: "method", message: "This payment method is not available." });
  else if (!method.currencies.includes(choice.currency)) issues.push({ path: "method", message: `This payment method is not available in ${choice.currency}.` });
  // The method's own limits only (PayPal monthly); the global monthly switch is the frequency issue above.
  else if (!methodFrequencies(choice.method, { ...flags, monthly: true }).includes(choice.frequency)) issues.push({ path: "method", message: "This payment method is not available for monthly donations." });
  return issues;
}
