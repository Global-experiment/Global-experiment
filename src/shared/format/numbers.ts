/**
 * Number display rules from the client's "Numbers" page (Notion, 0.1 native;
 * docs/architecture/formatting.md): English formatting everywhere, whatever
 * the visitor's locale — Latin digits, comma grouping, point decimals; the
 * minus sign U+2212; exact halves round away from zero; rounding is for
 * display only. One function per kind of value, each with explicit precision.
 */

export const MINUS = "−";
export const NBSP = " ";
export const UNAVAILABLE = "Unavailable";
export const NOT_APPLICABLE = "Not applicable";

const grouped = (digits: number) => new Intl.NumberFormat("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: true });

/** Rounds |value| to `digits` decimals, exact halves away from zero (decimal-string arithmetic, no binary drift). */
export function roundHalfAway(value: number, digits: number): number {
  const magnitude = Math.abs(value);
  const rounded = Number(`${Math.round(Number(`${magnitude}e${digits}`))}e-${digits}`);
  return value < 0 ? -rounded : rounded;
}

/** Signs a formatted magnitude: "−" before negatives (and before a currency code); rounded negative zero is plain zero. */
function signed(value: number, digits: number, body: (magnitude: number) => string): string {
  const rounded = roundHalfAway(value, digits);
  if (rounded === 0) return body(0);
  return rounded < 0 ? `${MINUS}${body(-rounded)}` : body(rounded);
}

/** Whole numbers and counts: 0 · 999 · 1,000 · 1,234,567. */
export function formatInteger(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return UNAVAILABLE;
  return signed(value, 0, (magnitude) => grouped(0).format(magnitude));
}

/**
 * General decimals: up to `maxDigits` places (2 unless the field needs more),
 * trailing zeroes removed, leading zero kept: 1.5 · 1,234.56 · 8 · 0.5. A
 * nonzero value that would round to zero shows the threshold: "less than 0.01".
 */
export function formatDecimal(value: number | null | undefined, maxDigits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return UNAVAILABLE;
  const smallest = 10 ** -maxDigits;
  if (value !== 0 && Math.abs(value) < smallest / 2) {
    const threshold = grouped(maxDigits).format(smallest);
    return value > 0 ? `less than ${threshold}` : `more than ${MINUS}${threshold}`;
  }
  return signed(value, maxDigits, (magnitude) => new Intl.NumberFormat("en-US", { maximumFractionDigits: maxDigits }).format(magnitude));
}

/**
 * Percentages (`value` in percent, 62.4 = 62.4%): up to 1 decimal, no space,
 * a trailing .0 removed. Endpoints are reserved for exact values: between 0%
 * and 0.1% reads "less than 0.1%", between 99.9% and 100% "more than 99.9%".
 */
export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return UNAVAILABLE;
  if (value > 0 && value < 0.1) return "less than 0.1%";
  if (value > 99.9 && value < 100) return "more than 99.9%";
  return `${signed(value, 1, (magnitude) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(magnitude))}%`;
}

/** Scores out of 10: always one decimal and the denominator, "8.0 / 10". */
export function formatScore(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return UNAVAILABLE;
  return `${signed(value, 1, (magnitude) => grouped(1).format(magnitude))}${NBSP}/${NBSP}10`;
}

/** The currency's standard number of decimal places (2 for USD/EUR/CHF). */
const currencyDigits = (currency: string) => new Intl.NumberFormat("en-US", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;

/**
 * Money from minor units: the uppercase code, a nonbreaking space, the amount
 * with the currency's decimals, trailing zeroes kept: "USD 39.80",
 * "CHF 1,234.50"; negatives "−USD 39.80".
 */
export function formatMoney(minor: number | null | undefined, currency: string): string {
  if (minor === null || minor === undefined || Number.isNaN(minor)) return UNAVAILABLE;
  const code = currency.toUpperCase();
  const digits = currencyDigits(code);
  return signed(minor / 10 ** digits, digits, (magnitude) => `${code}${NBSP}${grouped(digits).format(magnitude)}`);
}

/** Changes: "+12", "−12", and zero without a sign. */
export function formatChange(value: number, maxDigits = 0): string {
  const rounded = roundHalfAway(value, maxDigits);
  const body = new Intl.NumberFormat("en-US", { maximumFractionDigits: maxDigits }).format(Math.abs(rounded));
  return rounded > 0 ? `+${body}` : rounded < 0 ? `${MINUS}${body}` : "0";
}

/** Percentage-point change between two percentages: "+5 pp". */
export const formatPointChange = (from: number, to: number) => `${formatChange(to - from, 1)}${NBSP}pp`;

/** Ranges: an en dash, no spaces — "10–20", "10%–20%". */
export const formatRange = (from: string, to: string) => `${from}–${to}`;

/** Compact suffixes, smallest first. */
const COMPACT: readonly [number, string][] = [
  [1e3, "K"],
  [1e6, "M"],
  [1e9, "B"],
  [1e12, "T"],
];

/**
 * Compact numbers, for counters, summary cards and charts only: K/M/B/T, no
 * space, at most 1 decimal, a trailing .0 removed; rounding that reaches the
 * next magnitude promotes the suffix (999,999 → 1M, never 1,000K).
 */
export function formatCompact(value: number): string {
  const magnitude = Math.abs(value);
  if (roundHalfAway(magnitude, 0) < 1000) return formatInteger(value);
  let index = COMPACT.findLastIndex(([size]) => magnitude >= size);
  if (index < 0) index = 0; // 999.5 rounds to 1,000: shown as 1K
  let scaled = roundHalfAway(magnitude / COMPACT[index]![0], 1);
  if (scaled >= 1000 && index < COMPACT.length - 1) {
    index += 1;
    scaled = roundHalfAway(magnitude / COMPACT[index]![0], 1);
  }
  const text = `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(scaled)}${COMPACT[index]![1]}`;
  return value < 0 ? `${MINUS}${text}` : text;
}

/** Identifiers keep their exact form: no grouping, no rounding ("001234", "PER-81"). */
export const formatIdentifier = (value: string | number) => String(value);
