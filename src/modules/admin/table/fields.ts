import type { AdminIconName } from "../ui/adminIcons";
import type { FilterOperator, SortRule } from "./listState";

/** One filterable/sortable field of an admin list, as the API's list contract declares it. */
export interface ListField {
  /** API field name (`filter=<id>:…` / `sort=<id>:…`). */
  id: string;
  label: string;
  icon: AdminIconName;
  /** Filter operators the API accepts for this field (empty = not filterable). */
  operators: readonly FilterOperator[];
  /** Fixed choices (vocabulary, relations, booleans); free text otherwise. */
  options?: readonly { value: string; label: string }[];
  /** Sortable; `dates` fields describe direction as New/Old first (figma.pdf p42). */
  sort?: "text" | "dates";
}

export const OPERATOR_LABEL: Record<FilterOperator, string> = {
  is: "Is",
  is_not: "Is not",
  contains: "Contains",
  not_contains: "Does not contain",
  is_empty: "Is empty",
  is_not_empty: "Is not empty",
};

export function directionLabel(field: ListField | undefined, direction: SortRule["direction"]): string {
  if (field?.sort === "dates") return direction === "desc" ? "New first" : "Old first";
  return direction === "asc" ? "Ascending" : "Descending";
}

/** The sort button text (Figma: "Last published first"), from the primary sort rule. */
export function sortButtonLabel(fields: readonly ListField[], sort: readonly SortRule[]): string {
  const [primary, ...rest] = sort;
  if (!primary) return "Sort";
  const field = fields.find((candidate) => candidate.id === primary.field);
  const name = (field?.label ?? primary.field).toLowerCase();
  const text =
    field?.sort === "dates"
      ? primary.direction === "desc"
        ? `Last ${name} first`
        : `First ${name} first`
      : `${field?.label ?? primary.field} ${primary.direction === "asc" ? "ascending" : "descending"}`;
  return rest.length > 0 ? `${text} +${rest.length}` : text;
}
