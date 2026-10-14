import { describe, expect, it } from "vitest";
import { formatCount, formatExact, formatMedian, formatTotal, formatWhole, isDonationCurrency, minorToAmountText, parseAmountToMinor } from "./money";

describe("donate money helpers", () => {
  it("parses amounts like the API: digits, one '.' or ',' and at most two decimals", () => {
    expect(parseAmountToMinor("10")).toBe(1000);
    expect(parseAmountToMinor("10.5")).toBe(1050);
    expect(parseAmountToMinor(" 10,50 ")).toBe(1050);
    expect(parseAmountToMinor("0.01")).toBe(1);
    for (const bad of ["", ".", "10.", ".5", "1.234", "1,000.00", "-1", "1e3", "abc", "12345678"]) expect(parseAmountToMinor(bad), bad).toBeNull();
  });

  it("writes amounts back for the URL and the API", () => {
    expect(minorToAmountText(1000)).toBe("10");
    expect(minorToAmountText(1050)).toBe("10.50");
    expect(minorToAmountText(1)).toBe("0.01");
  });

  it("labels presets like Figma ($2) in every currency", () => {
    expect(formatWhole(2, "USD")).toBe("$2");
    expect(formatWhole(50, "EUR")).toBe("€50");
    expect(formatWhole(10, "CHF")).toBe("CHF 10");
    expect(formatWhole(10000, "USD")).toBe("$10,000");
  });

  it("formats the stats like Figma: '$ 14.3K' and '$6.4'", () => {
    expect(formatTotal(1_431_250, "USD")).toBe("$ 14.3K");
    expect(formatTotal(0, "EUR")).toBe("€ 0");
    expect(formatTotal(-500, "EUR")).toBe("€ 0"); // refunds never show a negative total
    expect(formatTotal(250_000_000, "CHF")).toBe("CHF 2.5M");
    expect(formatMedian(640, "USD")).toBe("$6.4");
    expect(formatMedian(1000, "CHF")).toBe("CHF 10");
    expect(formatCount(321)).toBe("321");
    expect(formatCount(1200)).toBe("1.2K");
  });

  it("formats exact amounts for detail sheets", () => {
    expect(formatExact(1250, "USD")).toBe("$12.50");
    expect(formatExact(100_000, "CHF")).toBe("CHF 1,000");
  });

  it("knows the three currencies", () => {
    expect(["EUR", "USD", "CHF"].every(isDonationCurrency)).toBe(true);
    expect(isDonationCurrency("GBP")).toBe(false);
    expect(isDonationCurrency("usd")).toBe(false);
  });
});
