import { describe, expect, it } from "vitest";
import {
  activeFilterCount,
  clearFilters,
  DEFAULT_TREASURY_STATE,
  historyCurrencies,
  matchingPreset,
  nextTypeFilter,
  parseTreasuryParams,
  presetRange,
  statsCurrency,
  treasuryHref,
  withFilters,
} from "./treasuryParams";

describe("Treasury URL state", () => {
  it("defaults to every entry, newest first, in USD", () => {
    expect(parseTreasuryParams({})).toEqual(DEFAULT_TREASURY_STATE);
    expect(treasuryHref(DEFAULT_TREASURY_STATE)).toBe("/treasury");
  });

  it("reads and writes every part of the view", () => {
    const state = parseTreasuryParams({
      currency: "eur",
      type: "expense",
      from: "2026-01-01",
      to: "2026-06-30",
      types: "hosting_and_infrastructure,legal_and_compliance",
      sort: "amount_asc",
      page: "3",
    });
    expect(state).toEqual({
      currency: "EUR",
      type: "expense",
      from: "2026-01-01",
      to: "2026-06-30",
      expenseTypes: ["hosting_and_infrastructure", "legal_and_compliance"],
      sort: "amount_asc",
      page: 3,
    });
    expect(treasuryHref(state)).toBe(
      "/treasury?currency=EUR&type=expense&from=2026-01-01&to=2026-06-30&types=hosting_and_infrastructure,legal_and_compliance&sort=amount_asc&page=3",
    );
    expect(parseTreasuryParams(Object.fromEntries(new URL(`http://x${treasuryHref(state)}`).searchParams))).toEqual(state);
  });

  it("ignores what it can't read instead of failing the page", () => {
    expect(
      parseTreasuryParams({ currency: "GBP", type: "refund", from: "2026-02-30", to: "soon", types: "Bad Key", sort: "name", page: "-1" }),
    ).toEqual(DEFAULT_TREASURY_STATE);
    // Dates given the wrong way round are swapped.
    expect(parseTreasuryParams({ from: "2026-06-30", to: "2026-01-01" })).toMatchObject({ from: "2026-01-01", to: "2026-06-30" });
  });

  it("starts a new view on page 1 and counts the active filters", () => {
    const paged = { ...DEFAULT_TREASURY_STATE, page: 4 };
    expect(withFilters(paged, { type: "donation" })).toMatchObject({ type: "donation", page: 1 });
    expect(activeFilterCount(DEFAULT_TREASURY_STATE)).toBe(0);
    const busy = { ...DEFAULT_TREASURY_STATE, type: "expense" as const, from: "2026-01-01", expenseTypes: ["x"] };
    expect(activeFilterCount(busy)).toBe(3);
    expect(clearFilters({ ...busy, sort: "amount_desc", currency: "CHF" })).toEqual({ ...DEFAULT_TREASURY_STATE, sort: "amount_desc", currency: "CHF" });
  });

  it("the currency drives the stats and the history; 'All currencies' lists every currency with the default's stats", () => {
    const all = parseTreasuryParams({ currency: "all" });
    expect(all.currency).toBe("all");
    expect(treasuryHref(all)).toBe("/treasury?currency=all");
    expect(statsCurrency(all)).toBe("USD");
    expect(historyCurrencies(all)).toEqual([]);
    const eur = parseTreasuryParams({ currency: "EUR" });
    expect([statsCurrency(eur), historyCurrencies(eur)]).toEqual(["EUR", ["EUR"]]);
    expect(historyCurrencies(DEFAULT_TREASURY_STATE)).toEqual(["USD"]);
    // Erasing the filters keeps the chosen currency (it's the header switch).
    expect(clearFilters({ ...eur, type: "expense" }).currency).toBe("EUR");
  });

  it("toggles the Expenses / Donations pills (all ⇄ one, straight across)", () => {
    expect(nextTypeFilter(null, "expense")).toBe("expense");
    expect(nextTypeFilter("expense", "expense")).toBeNull();
    expect(nextTypeFilter("expense", "donation")).toBe("donation");
  });
});

describe("date presets (p16)", () => {
  const today = "2026-10-15"; // a Thursday

  it("computes each range up to today", () => {
    expect(presetRange("this_week", today)).toEqual({ from: "2026-10-12", to: today });
    expect(presetRange("this_month", today)).toEqual({ from: "2026-10-01", to: today });
    expect(presetRange("last_6_months", today)).toEqual({ from: "2026-04-15", to: today });
    expect(presetRange("this_year", today)).toEqual({ from: "2026-01-01", to: today });
    expect(presetRange("all", today)).toEqual({ from: null, to: null });
  });

  it("starts weeks on Monday and clamps month ends", () => {
    expect(presetRange("this_week", "2026-10-18").from).toBe("2026-10-12"); // Sunday
    expect(presetRange("this_week", "2026-10-12").from).toBe("2026-10-12"); // Monday
    expect(presetRange("last_6_months", "2026-08-31").from).toBe("2026-02-28");
  });

  it("recognises a preset from its range", () => {
    expect(matchingPreset("2026-10-01", today, today)).toBe("this_month");
    expect(matchingPreset(null, null, today)).toBe("all");
    expect(matchingPreset("2026-03-02", "2026-05-01", today)).toBeNull();
  });
});
