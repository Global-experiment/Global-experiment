import type { TreasuryTransaction } from "./presentationData";

/**
 * Treasury history filter (client feedback): the default is ALL — never
 * expenses. Clicking a pill selects it; clicking the active pill returns to
 * all; clicking the other pill switches straight across.
 *
 *   all ──expenses──▶ expenses ──expenses──▶ all
 *   all ──donations─▶ donations ─donations─▶ all
 *   expenses ◀──────── cross-switch ────────▶ donations
 */
export type HistoryFilter = "all" | "expenses" | "donations";
export type HistoryPill = Exclude<HistoryFilter, "all">;

export const INITIAL_HISTORY_FILTER: HistoryFilter = "all";

export function nextHistoryFilter(current: HistoryFilter, clicked: HistoryPill): HistoryFilter {
  return current === clicked ? "all" : clicked;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Sort key for the presentation dates ("Aug 12 09:14" — no year in Figma,
 * so all are taken as the same year). Unparseable dates sort last.
 */
export function transactionTimestamp(date: string): number {
  const match = /^([A-Z][a-z]{2}) (\d{1,2}) (\d{2}):(\d{2})$/.exec(date.trim());
  const month = match ? MONTHS.indexOf(match[1]) : -1;
  if (!match || month === -1) return Number.NEGATIVE_INFINITY;
  return Date.UTC(2000, month, Number(match[2]), Number(match[3]), Number(match[4]));
}

/** Transactions for a filter, newest first. */
export function filterHistory(
  transactions: readonly TreasuryTransaction[],
  filter: HistoryFilter,
): TreasuryTransaction[] {
  const kept =
    filter === "all"
      ? [...transactions]
      : transactions.filter((t) => (filter === "expenses" ? t.kind === "expense" : t.kind === "income"));
  return kept.sort((a, b) => transactionTimestamp(b.date) - transactionTimestamp(a.date));
}
