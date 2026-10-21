/**
 * Date and time display rules from the client's "Date and time" page
 * (Notion, 0.1 native; docs/architecture/formatting.md). Timestamps are
 * stored in UTC and shown in the viewer's time zone (Europe/Zurich until the
 * browser's is known); date-only values are never converted. Three formats,
 * chosen by context:
 *   - clickable content that opens its details: elapsed time, "3d"
 *   - non-clickable content among other timestamps: "Oct 14 9:24 PM"
 *   - a record's own timestamps on its detail page: "October 14 at 9:24 PM"
 * The year and time zone stay available on hover/focus (`formatReference`).
 */

export const DEFAULT_TIME_ZONE = "Europe/Zurich";

export type TimestampInput = Date | string | number;
const toDate = (value: TimestampInput) => (value instanceof Date ? value : new Date(value));

function parts(date: Date, timeZone: string, options: Intl.DateTimeFormatOptions): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of new Intl.DateTimeFormat("en-US", { timeZone, hour12: true, ...options }).formatToParts(date)) out[part.type] = part.value;
  return out;
}

/** 12-hour clock, no leading zero on the hour, two minute digits, uppercase AM/PM: "9:24 PM". */
function clock(date: Date, timeZone: string): string {
  const p = parts(date, timeZone, { hour: "numeric", minute: "2-digit" });
  return `${p.hour}:${p.minute} ${(p.dayPeriod ?? "").toUpperCase()}`;
}

/** Short exact: abbreviated month, no "at" — "Oct 14 9:24 PM". */
export function formatShortDateTime(value: TimestampInput, timeZone = DEFAULT_TIME_ZONE): string {
  const date = toDate(value);
  const p = parts(date, timeZone, { month: "short", day: "numeric" });
  return `${p.month} ${p.day} ${clock(date, timeZone)}`;
}

/** Full exact, for the record's own detail page: "October 14 at 9:24 PM". */
export function formatFullDateTime(value: TimestampInput, timeZone = DEFAULT_TIME_ZONE): string {
  const date = toDate(value);
  const p = parts(date, timeZone, { month: "long", day: "numeric" });
  return `${p.month} ${p.day} at ${clock(date, timeZone)}`;
}

/** The unambiguous reference shown on hover/focus: year and time zone included. */
export function formatReference(value: TimestampInput, timeZone = DEFAULT_TIME_ZONE): string {
  const date = toDate(value);
  const p = parts(date, timeZone, { month: "long", day: "numeric", year: "numeric", timeZoneName: "short" });
  return `${p.month} ${p.day}, ${p.year} at ${clock(date, timeZone)} ${p.timeZoneName}`;
}

/** Whole calendar months from `from` to `to` (UTC calendar, so the result is the same worldwide). */
function wholeMonths(from: Date, to: Date): number {
  let months = (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth());
  const anniversary = new Date(from.getTime());
  anniversary.setUTCMonth(from.getUTCMonth() + months);
  // setUTCMonth overflows (Jan 31 + 1 month = Mar 3): the month isn't complete until that point.
  if (anniversary.getTime() > to.getTime()) months -= 1;
  return Math.max(0, months);
}

const UNITS = {
  min: ["minute", "minutes"],
  h: ["hour", "hours"],
  d: ["day", "days"],
  w: ["week", "weeks"],
  m: ["month", "months"],
  y: ["year", "years"],
} as const;

/**
 * Elapsed time, the largest completed unit, rounded down, one unit only:
 * Just now · 25min · 4h · 3d · 3w · 8m · 3y ("min" for minutes, "m" for
 * months). Real elapsed time — "4h" worldwide, never "Yesterday". Future
 * timestamps (clock skew) read "Just now". `spoken` is the expanded wording
 * for assistive technology.
 */
export function formatElapsed(value: TimestampInput, now: TimestampInput = Date.now()): { text: string; spoken: string } {
  const from = toDate(value);
  const to = toDate(now);
  const seconds = Math.floor((to.getTime() - from.getTime()) / 1000);
  if (seconds < 60) return { text: "Just now", spoken: "just now" };
  const pick = (count: number, unit: keyof typeof UNITS) => ({
    text: `${count}${unit}`,
    spoken: `${count} ${UNITS[unit][count === 1 ? 0 : 1]} ago`,
  });
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return pick(minutes, "min");
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return pick(hours, "h");
  const months = wholeMonths(from, to);
  if (months >= 12) return pick(Math.floor(months / 12), "y");
  if (months >= 1) return pick(months, "m");
  const days = Math.floor(hours / 24);
  if (days < 7) return pick(days, "d");
  return pick(Math.floor(days / 7), "w");
}

/**
 * Date-only values (first and last contact, birth dates): shown as stored,
 * never converted between time zones — "October 14, 2026" (with the year:
 * there is no hover reference for a plain date).
 */
export function formatDateOnly(value: string, style: "full" | "short" = "full"): string {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  const date = new Date(Date.UTC(year, month - 1, day));
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: style === "full" ? "long" : "short", day: "numeric", year: "numeric" }).format(date);
}
