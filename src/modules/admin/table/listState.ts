/**
 * Admin list state ⇄ URL ⇄ API query. Search, sort, filters and page live
 * in the URL (shareable, and returning from a record restores the table),
 * and map 1:1 onto the API's list contract:
 *   ?q=…&sort=field:dir&filter=field:op[:value]&page=N
 * Pure functions only — unit-tested, no React.
 */

export type SortDirection = "asc" | "desc";
export type FilterOperator = "is" | "is_not" | "contains" | "not_contains" | "is_empty" | "is_not_empty";

export interface SortRule {
  field: string;
  direction: SortDirection;
}

export interface FilterRule {
  field: string;
  operator: FilterOperator;
  value?: string;
}

export interface ListState {
  search: string;
  sort: SortRule[];
  filters: FilterRule[];
  page: number;
}

export const VALUELESS_OPERATORS: ReadonlySet<FilterOperator> = new Set(["is_empty", "is_not_empty"]);
const OPERATORS: ReadonlySet<string> = new Set(["is", "is_not", "contains", "not_contains", "is_empty", "is_not_empty"]);

export function parseSort(raw: string): SortRule | undefined {
  const [field, direction] = raw.split(":");
  if (!field || (direction !== "asc" && direction !== "desc")) return undefined;
  return { field, direction };
}

export function parseFilter(raw: string): FilterRule | undefined {
  const first = raw.indexOf(":");
  if (first <= 0) return undefined;
  const second = raw.indexOf(":", first + 1);
  const field = raw.slice(0, first);
  const operator = second === -1 ? raw.slice(first + 1) : raw.slice(first + 1, second);
  if (!OPERATORS.has(operator)) return undefined;
  const value = second === -1 ? undefined : raw.slice(second + 1);
  return value === undefined ? { field, operator: operator as FilterOperator } : { field, operator: operator as FilterOperator, value };
}

export const serializeSort = (rule: SortRule) => `${rule.field}:${rule.direction}`;
export const serializeFilter = (rule: FilterRule) =>
  VALUELESS_OPERATORS.has(rule.operator) ? `${rule.field}:${rule.operator}` : `${rule.field}:${rule.operator}:${rule.value ?? ""}`;

/** A filter the API would accept: valueless operators need nothing, the rest a non-blank value. */
export function isCompleteFilter(rule: FilterRule): boolean {
  return VALUELESS_OPERATORS.has(rule.operator) || (rule.value ?? "").trim() !== "";
}

export function readListState(params: URLSearchParams, defaultSort: SortRule[]): ListState {
  const sort = params.getAll("sort").map(parseSort).filter((rule): rule is SortRule => rule !== undefined);
  const filters = params.getAll("filter").map(parseFilter).filter((rule): rule is FilterRule => rule !== undefined);
  const page = Number.parseInt(params.get("page") ?? "1", 10);
  return {
    search: params.get("q") ?? "",
    sort: sort.length > 0 ? sort : defaultSort,
    filters,
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

/** URL query for the browser address bar (defaults omitted to keep URLs short). */
export function listStateToUrl(state: ListState, defaultSort: SortRule[]): string {
  const params = new URLSearchParams();
  if (state.search.trim()) params.set("q", state.search.trim());
  if (!sameSort(state.sort, defaultSort)) for (const rule of state.sort) params.append("sort", serializeSort(rule));
  for (const rule of state.filters) params.append("filter", serializeFilter(rule));
  if (state.page > 1) params.set("page", String(state.page));
  const query = params.toString();
  return query ? `?${query}` : "";
}

/** Query string for the API (incomplete filter rows being edited are left out). */
export function listStateToApiQuery(state: ListState, pageSize: number): string {
  const params = new URLSearchParams();
  params.set("page", String(state.page));
  params.set("pageSize", String(pageSize));
  if (state.search.trim()) params.set("search", state.search.trim());
  for (const rule of state.sort) params.append("sort", serializeSort(rule));
  for (const rule of state.filters.filter(isCompleteFilter)) params.append("filter", serializeFilter(rule));
  return `?${params.toString()}`;
}

export function sameSort(a: SortRule[], b: SortRule[]): boolean {
  return a.length === b.length && a.every((rule, index) => rule.field === b[index]?.field && rule.direction === b[index]?.direction);
}

/** "1 filter" / "2 filters" — counts only filters actually applied. */
export function filterButtonLabel(filters: FilterRule[]): string {
  const count = filters.filter(isCompleteFilter).length;
  if (count === 0) return "Filter";
  return count === 1 ? "1 filter" : `${count} filters`;
}

export const pageCount = (total: number, pageSize: number) => Math.max(1, Math.ceil(total / pageSize));
