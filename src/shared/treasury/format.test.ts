import { describe, expect, it } from "vitest";
import {
  amountInWords,
  formatCodeAmount,
  formatCompact,
  formatEntryDay,
  formatEntryMoment,
  formatEntryTime,
  formatLastUpdated,
  formatSignedAmount,
  numberToWords,
  zurichToday,
} from "./format";

const now = new Date("2026-10-15T10:00:00Z");

describe("Treasury amounts", () => {
  it("writes rows and detail amounts as Figma does (p11, p22)", () => {
    expect(formatSignedAmount(5000, "USD")).toBe("+ USD 50");
    expect(formatSignedAmount(-5000, "USD")).toBe("- USD 50");
    expect(formatSignedAmount(-1250, "EUR")).toBe("- EUR 12.50");
    expect(formatCodeAmount(-567500, "USD")).toBe("USD 5,675");
    expect(formatCodeAmount(500, "CHF")).toBe("CHF 5");
  });

  it("compacts the Expenses stat and never shows a negative total", () => {
    expect(formatCompact(3_980_000)).toBe("39.8K");
    expect(formatCompact(1000)).toBe("10");
    expect(formatCompact(-5)).toBe("0");
  });

  it("spells amounts for the page-actions sentence (p23, p27)", () => {
    expect(numberToWords(0)).toBe("zero");
    expect(numberToWords(5675)).toBe("five thousand six hundred seventy-five");
    expect(numberToWords(1_000_021)).toBe("one million twenty-one");
    expect(amountInWords(567500, "USD")).toBe("five thousand six hundred seventy-five American dollars");
    expect(amountInWords(-500, "USD")).toBe("five American dollars");
    expect(amountInWords(100, "EUR")).toBe("one euro");
    expect(amountInWords(1250, "EUR")).toBe("twelve euros and fifty cents");
    expect(amountInWords(1, "CHF")).toBe("one centime");
  });
});

describe("Treasury times (Europe/Zurich)", () => {
  const entry = { occurredOn: "2026-04-06", occurredAt: "2026-04-06T12:07:00Z" };

  it("shows the row time in Zurich, with the year only when it isn't this year", () => {
    expect(formatEntryTime(entry, now)).toBe("Apr 6 2:07 PM");
    expect(formatEntryTime({ occurredOn: "2025-04-06", occurredAt: "2025-04-06T18:46:00Z" }, now)).toBe("Apr 6, 2025 8:46 PM");
    // A date-only Notion expense: the day, no invented time.
    expect(formatEntryTime({ occurredOn: "2026-04-06", occurredAt: null }, now)).toBe("Apr 6");
  });

  it("writes the menu sentences' dates", () => {
    expect(formatEntryMoment(entry, now)).toBe("April 6 at 2:07 PM");
    expect(formatEntryDay({ occurredOn: "2025-04-06", occurredAt: "2025-04-06T10:00:00Z" })).toBe("April 6, 2025");
  });

  it("writes the last update as a time today, with the date otherwise", () => {
    expect(formatLastUpdated("2026-10-15T12:01:00Z", now)).toBe("2:01PM");
    expect(formatLastUpdated("2026-10-14T12:01:00Z", now)).toBe("2:01PM on October 14");
    expect(formatLastUpdated("2025-10-14T12:01:00Z", now)).toBe("2:01PM on October 14, 2025");
  });

  it("takes today's date in Zurich, not UTC", () => {
    expect(zurichToday(new Date("2026-10-15T22:30:00Z"))).toBe("2026-10-16");
  });
});

describe("stat trends (p11)", () => {
  it("writes a signed percent with one decimal at most; nothing without a base", async () => {
    const { formatTrend } = await import("./format");
    expect(formatTrend(2.1)).toBe("+2.1%");
    expect(formatTrend(-0.4)).toBe("-0.4%");
    expect(formatTrend(25)).toBe("+25%");
    expect(formatTrend(0)).toBe("0%");
    expect(formatTrend(null)).toBeUndefined();
  });
  it("the Balance stat: the symbol always spaced (\"$ 91.3K\")", async () => {
    const { formatStatAmount } = await import("@/shared/donate/money");
    expect(formatStatAmount(9_130_000, "USD")).toBe("$ 91.3K");
    expect(formatStatAmount(2_450_000, "EUR")).toBe("€ 24.5K");
    expect(formatStatAmount(1_180_000, "CHF")).toBe("CHF 11.8K");
  });
});
