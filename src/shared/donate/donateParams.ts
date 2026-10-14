import { DONATION_CURRENCIES, isDonationCurrency, parseAmountToMinor, type DonationCurrency } from "./money";

export type DonationFrequency = "once" | "monthly";

/** What the donate page's URL can carry: `?currency=EUR&amount=12.50&frequency=monthly&canceled=1`. */
export interface DonateUrlState {
  currency: DonationCurrency;
  /** Minor units; null when the URL names no (valid) amount. */
  amountMinor: number | null;
  frequency: DonationFrequency;
  canceled: boolean;
  /** The private preview link's token, passed on to the API (which decides). */
  preview: string | null;
}

type SearchParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/**
 * Reads the URL leniently: anything unknown falls back to the defaults
 * instead of failing — a shared or hand-edited link always opens the page.
 */
export function parseDonateParams(
  params: SearchParams,
  defaults: { currency: DonationCurrency; monthlyEnabled: boolean },
): DonateUrlState {
  const currencyParam = first(params.currency)?.toUpperCase();
  const amountParam = first(params.amount);
  const frequencyParam = first(params.frequency);
  return {
    currency: isDonationCurrency(currencyParam) ? currencyParam : defaults.currency,
    amountMinor: amountParam ? parseAmountToMinor(amountParam) : null,
    frequency: frequencyParam === "monthly" && defaults.monthlyEnabled ? "monthly" : "once",
    canceled: first(params.canceled) === "1",
    preview: first(params.preview)?.slice(0, 200) || null,
  };
}

/** The donate page URL for a choice (canceled is never written back). */
export function donateHref(state: { currency: DonationCurrency; amountText?: string | null; frequency?: DonationFrequency; preview?: string | null }): string {
  const query = new URLSearchParams({ currency: state.currency });
  if (state.amountText) query.set("amount", state.amountText);
  if (state.frequency === "monthly") query.set("frequency", "monthly");
  // The private preview link keeps working while the visitor changes their choice.
  if (state.preview) query.set("preview", state.preview);
  return `/donate?${query.toString()}`;
}

export { DONATION_CURRENCIES };
