import type { DonationCurrency } from "@/shared/donate/money";

/**
 * How the Treasury writes money and time (Common pages p11, p22–p27).
 * Amounts arrive in signed minor units, per currency, never converted.
 * Times are the association's (Switzerland, Europe/Zurich), whatever the
 * server's or the visitor's zone, so a page renders the same everywhere.
 */

export const TREASURY_TIME_ZONE = "Europe/Zurich";

const number = (minor: number) =>
  new Intl.NumberFormat("en-US", { minimumFractionDigits: minor % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 }).format(minor / 100);

/** "USD 5,675", "EUR 12.50" — the detail pages' amount (p22, p26), unsigned. */
export function formatCodeAmount(minor: number, currency: string): string {
  return `${currency} ${number(Math.abs(minor))}`;
}

/** "+ USD 50", "- USD 50" — a history row (p11): money in, money out. */
export function formatSignedAmount(minor: number, currency: string): string {
  return `${minor < 0 ? "-" : "+"} ${formatCodeAmount(minor, currency)}`;
}

/** Stats row "39.8K" (p11, Expenses — the header shows the currency). */
export function formatCompact(minor: number): string {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(Math.max(0, minor) / 100);
}

function parts(date: Date, options: Intl.DateTimeFormatOptions): Record<string, string> {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: TREASURY_TIME_ZONE, hour12: true, ...options })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
}

/** The calendar year in Zurich. */
export const zurichYear = (date: Date) => Number(parts(date, { year: "numeric" }).year);

/** A date-only entry ("2026-04-06") as that calendar day, noon UTC (any zone shows the same day). */
const dayOnly = (occurredOn: string) => new Date(`${occurredOn}T12:00:00Z`);

export interface EntryTime {
  occurredOn: string;
  occurredAt: string | null;
}

/**
 * "Apr 6 8:46 PM" (p11 rows, p22 "Paid …"); the year is added when it
 * isn't the current one ("Apr 6, 2025 8:46 PM"), the time only when the
 * entry has one (Notion expenses may carry only a date).
 */
export function formatEntryTime(entry: EntryTime, now: Date): string {
  const date = entry.occurredAt ? new Date(entry.occurredAt) : dayOnly(entry.occurredOn);
  const p = parts(date, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
  const day = `${p.month} ${p.day}${Number(p.year) === zurichYear(now) ? "" : `, ${p.year}`}`;
  return entry.occurredAt ? `${day} ${p.hour}:${p.minute} ${String(p.dayPeriod).toUpperCase()}` : day;
}

/** "April 6 at 2:07 PM" (p23) — with the year when it isn't the current one; without a time for date-only entries. */
export function formatEntryMoment(entry: EntryTime, now: Date): string {
  const date = entry.occurredAt ? new Date(entry.occurredAt) : dayOnly(entry.occurredOn);
  const p = parts(date, { month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
  const day = `${p.month} ${p.day}${Number(p.year) === zurichYear(now) ? "" : `, ${p.year}`}`;
  return entry.occurredAt ? `${day} at ${p.hour}:${p.minute} ${String(p.dayPeriod).toUpperCase()}` : day;
}

/** "April 6, 2025" (p27). */
export function formatEntryDay(entry: EntryTime): string {
  const date = entry.occurredAt ? new Date(entry.occurredAt) : dayOnly(entry.occurredOn);
  const p = parts(date, { month: "long", day: "numeric", year: "numeric" });
  return `${p.month} ${p.day}, ${p.year}`;
}

/** "2:01PM" (p12: "Last updated at 2:01PM."), with the date when it isn't today. */
export function formatLastUpdated(iso: string, now: Date): string {
  const date = new Date(iso);
  const p = parts(date, { month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
  const today = parts(now, { month: "long", day: "numeric", year: "numeric" });
  const time = `${p.hour}:${p.minute}${String(p.dayPeriod).toUpperCase()}`;
  if (p.year === today.year && p.month === today.month && p.day === today.day) return time;
  return `${time} on ${p.month} ${p.day}${p.year === today.year ? "" : `, ${p.year}`}`;
}

/** Today's date in Zurich, "YYYY-MM-DD". */
export function zurichToday(now: Date): string {
  const p = parts(now, { year: "numeric", month: "2-digit", day: "2-digit" });
  return `${p.year}-${p.month}-${p.day}`;
}

// ---- Amounts in words (p23, p27: "five American dollars") ----

const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const SCALES: [number, string][] = [
  [1_000_000_000, "billion"],
  [1_000_000, "million"],
  [1_000, "thousand"],
];

function underThousand(n: number): string {
  const words: string[] = [];
  if (n >= 100) {
    words.push(`${ONES[Math.floor(n / 100)]} hundred`);
    n %= 100;
  }
  if (n >= 20) words.push(n % 10 === 0 ? TENS[Math.floor(n / 10)]! : `${TENS[Math.floor(n / 10)]}-${ONES[n % 10]}`);
  else if (n > 0) words.push(ONES[n]!);
  return words.join(" ");
}

/** 5675 → "five thousand six hundred seventy-five" (whole numbers, American English, no "and"). */
export function numberToWords(value: number): string {
  let n = Math.floor(Math.abs(value));
  if (n === 0) return ONES[0]!;
  const words: string[] = [];
  for (const [size, name] of SCALES) {
    if (n >= size) {
      words.push(`${underThousand(Math.floor(n / size))} ${name}`);
      n %= size;
    }
  }
  if (n > 0) words.push(underThousand(n));
  return words.join(" ");
}

const CURRENCY_WORDS: Record<DonationCurrency, { one: string; many: string; minorOne: string; minorMany: string }> = {
  USD: { one: "American dollar", many: "American dollars", minorOne: "cent", minorMany: "cents" },
  EUR: { one: "euro", many: "euros", minorOne: "cent", minorMany: "cents" },
  CHF: { one: "Swiss franc", many: "Swiss francs", minorOne: "centime", minorMany: "centimes" },
};

/** 567500 USD → "five thousand six hundred seventy-five American dollars"; 1250 → "twelve euros and fifty cents". */
export function amountInWords(minor: number, currency: string): string {
  const names = CURRENCY_WORDS[currency as DonationCurrency];
  const abs = Math.abs(minor);
  const major = Math.floor(abs / 100);
  const cents = abs % 100;
  if (!names) return formatCodeAmount(minor, currency);
  const main = `${numberToWords(major)} ${major === 1 ? names.one : names.many}`;
  if (cents === 0) return main;
  const small = `${numberToWords(cents)} ${cents === 1 ? names.minorOne : names.minorMany}`;
  return major === 0 ? small : `${main} and ${small}`;
}
