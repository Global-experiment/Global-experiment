/**
 * Money on the donate page: the three currencies the experiment takes, how
 * amounts are typed and how figures are shown. Amounts travel in minor units
 * (cents/centimes), as the API stores them. Parsing mirrors the API's rule
 * (apps/api/src/donations/donation-rules.ts) so the page can say what's wrong
 * before a round trip; the API stays the authority.
 */

export const DONATION_CURRENCIES = ["EUR", "USD", "CHF"] as const;
export type DonationCurrency = (typeof DONATION_CURRENCIES)[number];

export const isDonationCurrency = (value: unknown): value is DonationCurrency =>
  typeof value === "string" && (DONATION_CURRENCIES as readonly string[]).includes(value);

/** Figma writes "$2", "$ 14.3K", "$6.4": a symbol where one is unambiguous, the code otherwise. */
const PREFIX: Record<DonationCurrency, { symbol: string; spaced: boolean }> = {
  USD: { symbol: "$", spaced: false },
  EUR: { symbol: "€", spaced: false },
  CHF: { symbol: "CHF", spaced: true },
};

/** Amount text ("10", "10.5", "10,50") → minor units, or null if it isn't an amount with at most two decimals. */
export function parseAmountToMinor(text: string): number | null {
  const match = /^(\d{1,7})(?:[.,](\d{1,2}))?$/.exec(text.trim());
  if (!match) return null;
  return Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
}

/** Minor units → the text the API and the URL use: "10" or "10.50". */
export function minorToAmountText(minor: number): string {
  return minor % 100 === 0 ? String(minor / 100) : (minor / 100).toFixed(2);
}

const plain = (value: number, digits: number) =>
  new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: digits }).format(value);

/** "$2", "€20", "CHF 50" — preset buttons and limits. */
export function formatWhole(major: number, currency: DonationCurrency): string {
  const { symbol, spaced } = PREFIX[currency];
  return `${symbol}${spaced ? " " : ""}${plain(major, 2)}`;
}

/** "$12.50", "CHF 1,000" — an exact amount in minor units. */
export function formatExact(minor: number, currency: DonationCurrency): string {
  const { symbol, spaced } = PREFIX[currency];
  const major = minor / 100;
  const text = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: minor % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(major);
  return `${symbol}${spaced ? " " : ""}${text}`;
}

const compact = (major: number) =>
  new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(major);

/** Stats row: "$ 14.3K" (Donations, Figma p28 — spaced), never negative. */
export function formatTotal(minor: number, currency: DonationCurrency): string {
  return `${PREFIX[currency].symbol} ${compact(Math.max(0, minor) / 100)}`;
}

/** Stats row: "$6.4" (Med. donation, Figma p28 — not spaced). */
export function formatMedian(minor: number, currency: DonationCurrency): string {
  const { symbol, spaced } = PREFIX[currency];
  return `${symbol}${spaced ? " " : ""}${compact(minor / 100)}`;
}

/** Stats row: "321", "1.2K". */
export const formatCount = (count: number) => compact(count);
