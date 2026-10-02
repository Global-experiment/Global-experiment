import { describe, expect, it } from "vitest";
import {
  INITIAL_HISTORY_FILTER,
  filterHistory,
  nextHistoryFilter,
  transactionTimestamp,
} from "./historyFilter";
import { TREASURY_TRANSACTIONS, type TreasuryTransaction } from "./presentationData";

describe("history filter state machine", () => {
  it("defaults to all, never expenses", () => {
    expect(INITIAL_HISTORY_FILTER).toBe("all");
  });

  it("selects a pill from all, and the active pill toggles back to all", () => {
    expect(nextHistoryFilter("all", "expenses")).toBe("expenses");
    expect(nextHistoryFilter("expenses", "expenses")).toBe("all");
    expect(nextHistoryFilter("all", "donations")).toBe("donations");
    expect(nextHistoryFilter("donations", "donations")).toBe("all");
  });

  it("cross-switches directly between expenses and donations", () => {
    expect(nextHistoryFilter("expenses", "donations")).toBe("donations");
    expect(nextHistoryFilter("donations", "expenses")).toBe("expenses");
  });
});

describe("filterHistory", () => {
  it("keeps only the selected kind", () => {
    expect(filterHistory(TREASURY_TRANSACTIONS, "expenses").every((t) => t.kind === "expense")).toBe(true);
    expect(filterHistory(TREASURY_TRANSACTIONS, "donations").every((t) => t.kind === "income")).toBe(true);
    expect(filterHistory(TREASURY_TRANSACTIONS, "all")).toHaveLength(TREASURY_TRANSACTIONS.length);
  });

  it("orders newest first regardless of input order", () => {
    const row = (id: string, date: string): TreasuryTransaction => ({ id, label: id, kind: "income", tags: [], date });
    const shuffled = [row("a", "Aug 05 08:03"), row("b", "Aug 12 09:14"), row("c", "Jul 30 23:59"), row("d", "Aug 12 09:15")];
    expect(filterHistory(shuffled, "all").map((t) => t.id)).toEqual(["d", "b", "a", "c"]);
  });

  it("parses presentation dates and sorts unparseable ones last", () => {
    expect(transactionTimestamp("Aug 12 09:14")).toBeGreaterThan(transactionTimestamp("Aug 11 16:42"));
    expect(transactionTimestamp("soon")).toBe(Number.NEGATIVE_INFINITY);
  });

  it("does not mutate the input", () => {
    const input = [...TREASURY_TRANSACTIONS].reverse();
    const copy = [...input];
    filterHistory(input, "all");
    expect(input).toEqual(copy);
  });
});
