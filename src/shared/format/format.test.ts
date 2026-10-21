import { describe, expect, it } from "vitest";
import { formatDateOnly, formatElapsed, formatFullDateTime, formatReference, formatShortDateTime } from "./dates";
import {
  formatChange,
  formatCompact,
  formatDecimal,
  formatIdentifier,
  formatInteger,
  formatMoney,
  formatPercent,
  formatPointChange,
  formatRange,
  formatScore,
  MINUS,
  NBSP,
  roundHalfAway,
} from "./numbers";

/** The examples of the client's "Numbers" and "Date and time" pages (Notion, 0.1 native). */
describe("numbers", () => {
  it("whole numbers and counts: grouped in threes, no decimals", () => {
    expect([0, 12, 999, 1000, 1234567].map(formatInteger)).toEqual(["0", "12", "999", "1,000", "1,234,567"]);
    expect(formatInteger(-12)).toBe(`${MINUS}12`);
    expect(formatInteger(null)).toBe("Unavailable");
  });

  it("general decimals: up to 2 places, no trailing zeroes, leading zero, a threshold instead of a false zero", () => {
    expect([1.5, 1234.56, 8, 0.5].map((value) => formatDecimal(value))).toEqual(["1.5", "1,234.56", "8", "0.5"]);
    expect(formatDecimal(0.004)).toBe("less than 0.01");
    expect(formatDecimal(-0.004)).toBe(`more than ${MINUS}0.01`);
    expect(formatDecimal(1.23456, 4)).toBe("1.2346");
  });

  it("exact halves round away from zero; negative zero shows as zero", () => {
    expect(roundHalfAway(2.5, 0)).toBe(3);
    expect(roundHalfAway(-2.5, 0)).toBe(-3);
    expect(roundHalfAway(1.005, 2)).toBe(1.01);
    expect(formatDecimal(-0.001, 1)).toBe(`more than ${MINUS}0.1`);
    expect(formatInteger(-0.4)).toBe("0");
  });

  it("percentages: one decimal, no space, endpoints reserved", () => {
    expect([62, 62.4, 62.04, 0, 100].map(formatPercent)).toEqual(["62%", "62.4%", "62%", "0%", "100%"]);
    expect(formatPercent(0.05)).toBe("less than 0.1%");
    expect(formatPercent(99.95)).toBe("more than 99.9%");
    expect(formatPercent(-4.2)).toBe(`${MINUS}4.2%`);
  });

  it("scores out of 10 keep one decimal and the denominator", () => {
    expect(formatScore(8)).toBe(`8.0${NBSP}/${NBSP}10`);
    expect(formatScore(8.4)).toBe(`8.4${NBSP}/${NBSP}10`);
    expect(formatScore(null)).toBe("Unavailable");
  });

  it("money: code, nonbreaking space, the currency's decimals with trailing zeroes; minus before the code", () => {
    expect(formatMoney(3980, "usd")).toBe(`USD${NBSP}39.80`);
    expect(formatMoney(123450, "CHF")).toBe(`CHF${NBSP}1,234.50`);
    expect(formatMoney(-3980, "USD")).toBe(`${MINUS}USD${NBSP}39.80`);
    expect(formatMoney(0, "EUR")).toBe(`EUR${NBSP}0.00`);
  });

  it("changes, percentage points and ranges", () => {
    expect([12, -12, 0].map((value) => formatChange(value))).toEqual(["+12", `${MINUS}12`, "0"]);
    expect(formatPointChange(40, 45)).toBe(`+5${NBSP}pp`);
    expect(formatRange("10", "20")).toBe("10–20");
    expect(formatRange("10%", "20%")).toBe("10%–20%");
  });

  it("compact numbers: K/M/B/T, one decimal, promoted suffix", () => {
    expect([12, 999, 1000, 12300, 123456, 1_000_000, 1_200_000, 12_300_000, 1e9, 1.2e9, 1e12].map(formatCompact)).toEqual([
      "12",
      "999",
      "1K",
      "12.3K",
      "123.5K",
      "1M",
      "1.2M",
      "12.3M",
      "1B",
      "1.2B",
      "1T",
    ]);
    expect(formatCompact(999_999)).toBe("1M");
    expect(formatCompact(1_000)).toBe("1K");
    expect(formatCompact(-12_300)).toBe(`${MINUS}12.3K`);
  });

  it("identifiers keep their form", () => {
    expect(formatIdentifier("001234")).toBe("001234");
    expect(formatIdentifier(81)).toBe("81");
  });
});

describe("dates and times", () => {
  // 2026-10-14 19:24 UTC = 9:24 PM in Zurich (CEST, UTC+2).
  const moment = "2026-10-14T19:24:00Z";

  it("short exact: abbreviated month, no 'at', 12-hour clock, no leading zeroes", () => {
    expect(formatShortDateTime(moment)).toBe("Oct 14 9:24 PM");
    expect(formatShortDateTime("2026-03-05T08:07:00Z")).toBe("Mar 5 9:07 AM");
  });

  it("full exact for the record's own dates: full month and 'at'", () => {
    expect(formatFullDateTime(moment)).toBe("October 14 at 9:24 PM");
  });

  it("converts to the viewer's time zone, daylight saving included", () => {
    expect(formatShortDateTime(moment, "America/New_York")).toBe("Oct 14 3:24 PM");
    expect(formatShortDateTime("2026-12-14T19:24:00Z", "Europe/Zurich")).toBe("Dec 14 8:24 PM");
  });

  it("the hover reference adds the year and the time zone", () => {
    expect(formatReference(moment)).toBe("October 14, 2026 at 9:24 PM GMT+2");
  });

  it("elapsed time: the largest completed unit, rounded down, one unit, the same worldwide", () => {
    const now = new Date("2026-10-14T20:00:00Z");
    const ago = (ms: number) => formatElapsed(new Date(now.getTime() - ms), now).text;
    const minute = 60_000;
    const hour = 60 * minute;
    const day = 24 * hour;
    expect(ago(30_000)).toBe("Just now");
    expect(ago(minute)).toBe("1min");
    expect(ago(25 * minute)).toBe("25min");
    expect(ago(4 * hour + 45 * minute)).toBe("4h");
    expect(ago(day)).toBe("1d");
    expect(ago(3 * day)).toBe("3d");
    expect(ago(7 * day)).toBe("1w");
    expect(ago(3 * 7 * day)).toBe("3w");
    expect(formatElapsed("2026-09-14T20:00:00Z", now).text).toBe("1m");
    expect(formatElapsed("2026-02-14T20:00:00Z", now).text).toBe("8m");
    expect(formatElapsed("2025-10-14T20:00:00Z", now).text).toBe("1y");
    expect(formatElapsed("2023-10-14T19:00:00Z", now).text).toBe("3y");
    // Calendar-aware: Jan 31 → Feb 28 isn't a whole month yet.
    expect(formatElapsed("2026-01-31T12:00:00Z", "2026-02-28T12:00:00Z").text).toBe("4w");
    expect(formatElapsed(new Date(now.getTime() - 4 * hour), now).spoken).toBe("4 hours ago");
    expect(formatElapsed(new Date(now.getTime() - minute), now).spoken).toBe("1 minute ago");
  });

  it("date-only values are never shifted by a time zone", () => {
    expect(formatDateOnly("2026-10-14")).toBe("October 14, 2026");
    expect(formatDateOnly("2026-01-01", "short")).toBe("Jan 1, 2026");
  });
});
