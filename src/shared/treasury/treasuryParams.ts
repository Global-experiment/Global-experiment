import { isDonationCurrency, type DonationCurrency } from "@/shared/donate/money";

/**
 * The Treasury page's state lives in its URL, so every view (currency,
 * sort, filters, page) is shareable, works without JavaScript and is
 * rendered on the server. Unknown or malformed values fall back to the
 * default instead of failing the page.
 *
 *   /treasury?currency=EUR&type=expense&from=2026-01-01&to=2026-06-30&types=hosting&sort=amount_desc&page=2
 *
 * - `currency`: the header switch (and the filter sheet's Currency row) —
 *   the stats and the history both show that currency; `all` lists every
 *   currency in the history (amounts are never converted), with the stats of
 *   the default currency.
 * - `type`: expense | donation (donations with their refunds and disputes); absent = both.
 * - `q`: the search field (p11): public descriptions, expense types, entry numbers.
 */
export const TREASURY_SORTS = ["date_desc", "date_asc", "amount_desc", "amount_asc"] as const;
export type TreasurySort = (typeof TREASURY_SORTS)[number];
export type HistoryType = "expense" | "donation";

export const HISTORY_PAGE_SIZE = 25;

/** One currency, or every currency ("All currencies"). */
export type TreasuryCurrencyChoice = DonationCurrency | "all";

export interface TreasuryState {
  currency: TreasuryCurrencyChoice;
  type: HistoryType | null;
  from: string | null;
  to: string | null;
  expenseTypes: string[];
  sort: TreasurySort;
  page: number;
  /** The search text, or null. */
  q: string | null;
}

export const DEFAULT_TREASURY_STATE: TreasuryState = {
  currency: "USD",
  type: null,
  from: null,
  to: null,
  expenseTypes: [],
  sort: "date_desc",
  page: 1,
  q: null,
};

type Params = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
const listOf = (value: string | string[] | undefined) => [...new Set(first(value).split(",").map((part) => part.trim()).filter(Boolean))];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isDate = (value: string) => DATE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().startsWith(value);

export function parseTreasuryParams(params: Params, defaultCurrency: DonationCurrency = "USD"): TreasuryState {
  const currency = first(params.currency).toUpperCase();
  const chosen: TreasuryCurrencyChoice | null = currency === "ALL" ? "all" : isDonationCurrency(currency) ? currency : null;
  const type = first(params.type);
  const sort = first(params.sort);
  const page = Number(first(params.page));
  let from = first(params.from);
  let to = first(params.to);
  if (!isDate(from)) from = "";
  if (!isDate(to)) to = "";
  if (from && to && from > to) [from, to] = [to, from];
  return {
    currency: chosen ?? defaultCurrency,
    type: type === "expense" || type === "donation" ? type : null,
    from: from || null,
    to: to || null,
    expenseTypes: listOf(params.types).filter((key) => /^[a-z][a-z0-9_]{0,39}$/.test(key)).slice(0, 20),
    sort: (TREASURY_SORTS as readonly string[]).includes(sort) ? (sort as TreasurySort) : "date_desc",
    page: Number.isInteger(page) && page >= 1 && page <= 10_000 ? page : 1,
    q: first(params.q).slice(0, 100) || null,
  };
}

/** The URL of a state; defaults are left out, so the plain page is just /treasury. */
export function treasuryHref(state: TreasuryState, defaultCurrency: DonationCurrency = "USD"): string {
  const params = new URLSearchParams();
  if (state.currency !== defaultCurrency) params.set("currency", state.currency);
  if (state.type) params.set("type", state.type);
  if (state.from) params.set("from", state.from);
  if (state.to) params.set("to", state.to);
  if (state.expenseTypes.length > 0) params.set("types", state.expenseTypes.join(","));
  if (state.sort !== "date_desc") params.set("sort", state.sort);
  if (state.q) params.set("q", state.q);
  if (state.page > 1) params.set("page", String(state.page));
  const search = params.toString().replace(/%2C/g, ",");
  return search ? `/treasury?${search}` : "/treasury";
}

/** A new view of the history starts again on page 1. */
export const withFilters = (state: TreasuryState, changes: Partial<Omit<TreasuryState, "page">>): TreasuryState => ({ ...state, ...changes, page: 1 });

/** How many filters are narrowing the history (the Filter button's count). */
export function activeFilterCount(state: TreasuryState): number {
  return [state.type !== null, state.from !== null || state.to !== null, state.expenseTypes.length > 0].filter(Boolean).length;
}

export const clearFilters = (state: TreasuryState): TreasuryState =>
  withFilters(state, { type: null, from: null, to: null, expenseTypes: [] });

/** The currency of the stats: the chosen one, or the default with "All currencies". */
export const statsCurrency = (state: Pick<TreasuryState, "currency">, defaultCurrency: DonationCurrency = "USD"): DonationCurrency =>
  state.currency === "all" ? defaultCurrency : state.currency;

/** The history's currency filter for the API: none with "All currencies". */
export const historyCurrencies = (state: Pick<TreasuryState, "currency">): DonationCurrency[] => (state.currency === "all" ? [] : [state.currency]);

/**
 * The Expenses / Donations pills (client feedback): the default is all.
 * Clicking a pill selects it; clicking the active pill returns to all;
 * clicking the other pill switches straight across.
 */
export const nextTypeFilter = (current: HistoryType | null, clicked: HistoryType): HistoryType | null => (current === clicked ? null : clicked);

// ---- Date presets (Common pages p16) ----

export const DATE_PRESETS = ["this_week", "this_month", "last_6_months", "this_year", "all"] as const;
export type DatePreset = (typeof DATE_PRESETS)[number];

const iso = (date: Date) => date.toISOString().slice(0, 10);

/** The range of a preset, from today's date ("YYYY-MM-DD", in Zurich). Weeks start on Monday. */
export function presetRange(preset: DatePreset, today: string): { from: string | null; to: string | null } {
  const date = new Date(`${today}T00:00:00Z`);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  switch (preset) {
    case "this_week": {
      const monday = new Date(date);
      monday.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
      return { from: iso(monday), to: today };
    }
    case "this_month":
      return { from: iso(new Date(Date.UTC(year, month, 1))), to: today };
    case "last_6_months": {
      const start = new Date(Date.UTC(year, month - 6, date.getUTCDate()));
      // 31 Aug − 6 months is 3 Mar in JS; clamp to the last day of the target month (28/29 Feb).
      if (start.getUTCMonth() !== (((month - 6) % 12) + 12) % 12) start.setUTCDate(0);
      return { from: iso(start), to: today };
    }
    case "this_year":
      return { from: `${year}-01-01`, to: today };
    default:
      return { from: null, to: null };
  }
}

/** The preset a range matches today, if any. */
export function matchingPreset(from: string | null, to: string | null, today: string): DatePreset | null {
  return DATE_PRESETS.find((preset) => {
    const range = presetRange(preset, today);
    return range.from === from && range.to === to;
  }) ?? null;
}
