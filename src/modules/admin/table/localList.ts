import type { Page } from "../api/types";
import { isCompleteFilter, type FilterRule, type ListState } from "./listState";

/**
 * The list toolbar's search / filters / sorts / paging applied in the
 * browser, for small read-only collections already loaded whole (the
 * taxonomy: ≈1,250 nodes). Same semantics as the API's list contract:
 * filters AND together; "is" matches any of a multi-valued field; text
 * comparisons are case-insensitive. Pure — unit-tested.
 */

/** A field's value(s) for filtering and sorting: null/[] = empty. */
export type FieldValue = string | number | null | readonly string[];

export interface LocalListSpec<Row> {
  /** Field id (as in the ListField definitions) → the row's value. */
  values: Record<string, (row: Row) => FieldValue>;
  /** Where sorting needs another value than filtering (e.g. filter by id, sort by name). */
  sortValues?: Record<string, (row: Row) => FieldValue>;
  /** Texts the search box matches (contains, case-insensitive). */
  searchText: (row: Row) => (string | null)[];
}

const list = (value: FieldValue): string[] =>
  value === null ? [] : Array.isArray(value) ? [...value] : [String(value as string | number)];
const lower = (value: string) => value.toLocaleLowerCase();

export function matchesFilter<Row>(spec: LocalListSpec<Row>, row: Row, rule: FilterRule): boolean {
  const get = spec.values[rule.field];
  if (!get) return true; // unknown field: ignored, as the API would refuse it
  const values = list(get(row)).filter((value) => value !== "");
  const needle = lower((rule.value ?? "").trim());
  switch (rule.operator) {
    case "is_empty":
      return values.length === 0;
    case "is_not_empty":
      return values.length > 0;
    case "is":
      return values.some((value) => lower(value) === needle);
    case "is_not":
      return !values.some((value) => lower(value) === needle);
    case "contains":
      return values.some((value) => lower(value).includes(needle));
    case "not_contains":
      return !values.some((value) => lower(value).includes(needle));
  }
}

function compare(a: FieldValue, b: FieldValue): number {
  // Empty values sort last whatever the direction is (as the API's "nulls last").
  const first = Array.isArray(a) ? (a[0] ?? null) : a;
  const second = Array.isArray(b) ? (b[0] ?? null) : b;
  if (first === null || second === null) return first === second ? 0 : first === null ? 1 : -1;
  if (typeof first === "number" && typeof second === "number") return first - second;
  return String(first).localeCompare(String(second), undefined, { sensitivity: "base", numeric: true });
}

export function applyListState<Row extends { id: string }>(rows: readonly Row[], spec: LocalListSpec<Row>, state: ListState, pageSize: number): Page<Row> {
  const q = lower(state.search.trim());
  const filters = state.filters.filter(isCompleteFilter);
  const kept = rows.filter(
    (row) =>
      (!q || spec.searchText(row).some((text) => text !== null && lower(text).includes(q))) && filters.every((rule) => matchesFilter(spec, row, rule)),
  );
  const sorted = [...kept].sort((a, b) => {
    for (const rule of state.sort) {
      const get = spec.sortValues?.[rule.field] ?? spec.values[rule.field];
      if (!get) continue;
      const left = get(a);
      const right = get(b);
      const empty = (value: FieldValue) => value === null || (Array.isArray(value) && value.length === 0);
      if (empty(left) !== empty(right)) return empty(left) ? 1 : -1;
      const order = compare(left, right) * (rule.direction === "asc" ? 1 : -1);
      if (order !== 0) return order;
    }
    return 0; // stable: the loaded order breaks ties
  });
  const page = Math.min(Math.max(1, state.page), Math.max(1, Math.ceil(sorted.length / pageSize)));
  return { items: sorted.slice((page - 1) * pageSize, page * pageSize), page, pageSize, total: sorted.length };
}
