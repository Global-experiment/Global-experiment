import { z } from "zod";

/**
 * The one list contract every admin collection uses (plan §6):
 *
 *   ?page=1&pageSize=50
 *   &search=free text
 *   &sort=created:desc&sort=name:asc            (≤ 3, whitelisted fields)
 *   &filter=state:is:sourced&filter=name:contains:ana   (≤ 12, whitelisted)
 *
 * `filter` is `field:operator[:value]` — split on the first two colons, so
 * a value may itself contain colons. Fields, operators and value shapes are
 * declared per resource; anything else is a 400, never a SQL fragment.
 */

export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 50;
const MAX_SORTS = 3;
const MAX_FILTERS = 12;

export type SortDirection = "asc" | "desc";
export type FilterOperator = "is" | "is_not" | "contains" | "not_contains" | "is_empty" | "is_not_empty";

const VALUELESS: ReadonlySet<FilterOperator> = new Set(["is_empty", "is_not_empty"]);

export interface FilterDefinition {
  operators: readonly FilterOperator[];
  /** Validates (and may transform) the value of value-taking operators. */
  value?: z.ZodType<string | boolean>;
}

export interface ListDefinition<SortField extends string, FilterField extends string> {
  sortFields: readonly SortField[];
  defaultSort: readonly Sort<SortField>[];
  filters: Record<FilterField, FilterDefinition>;
}

export interface Sort<Field extends string> {
  field: Field;
  direction: SortDirection;
}

export interface Filter<Field extends string> {
  field: Field;
  operator: FilterOperator;
  value?: string | boolean;
}

export interface ListQuery<SortField extends string, FilterField extends string> {
  page: number;
  pageSize: number;
  search?: string;
  sort: Sort<SortField>[];
  filters: Filter<FilterField>[];
}

export interface Page<Item> {
  items: Item[];
  page: number;
  pageSize: number;
  total: number;
}

const asArray = (value: unknown) => (value === undefined ? [] : Array.isArray(value) ? value : [value]);

/** Builds the Zod schema for one resource's list query string. */
export function listQuerySchema<SortField extends string, FilterField extends string>(
  definition: ListDefinition<SortField, FilterField>,
) {
  const sortFields = new Set<string>(definition.sortFields);

  const sortItem = z.string().transform((raw, context): Sort<SortField> => {
    const [field = "", direction = "asc", extra] = raw.split(":");
    if (extra !== undefined || !sortFields.has(field) || (direction !== "asc" && direction !== "desc")) {
      context.addIssue({ code: "custom", message: `Unsupported sort "${raw.slice(0, 60)}".` });
      return z.NEVER;
    }
    return { field: field as SortField, direction };
  });

  const filterItem = z.string().transform((raw, context): Filter<FilterField> => {
    const first = raw.indexOf(":");
    const second = first === -1 ? -1 : raw.indexOf(":", first + 1);
    const field = first === -1 ? raw : raw.slice(0, first);
    const operator = (second === -1 ? raw.slice(first + 1) : raw.slice(first + 1, second)) as FilterOperator;
    const value = second === -1 ? undefined : raw.slice(second + 1);
    const fail = (message: string) => {
      context.addIssue({ code: "custom", message });
      return z.NEVER;
    };

    const spec = Object.hasOwn(definition.filters, field)
      ? definition.filters[field as FilterField]
      : undefined;
    if (!spec || first === -1) return fail(`Unsupported filter field "${field.slice(0, 40)}".`);
    if (!spec.operators.includes(operator)) return fail(`Unsupported operator for "${field}".`);
    if (VALUELESS.has(operator)) {
      return value === undefined || value === ""
        ? { field: field as FilterField, operator }
        : fail(`"${operator}" takes no value.`);
    }
    if (value === undefined || value.trim() === "") return fail(`Filter "${field}" needs a value.`);
    const parsed = (spec.value ?? z.string().trim().min(1).max(200)).safeParse(value);
    if (!parsed.success) return fail(`Invalid value for filter "${field}".`);
    return { field: field as FilterField, operator, value: parsed.data };
  });

  return z
    .object({
      page: z.coerce.number().int().min(1).max(100_000).default(1),
      pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
      search: z
        .string()
        .trim()
        .max(200)
        .optional()
        .transform((value) => (value ? value : undefined)),
      sort: z.preprocess(asArray, z.array(sortItem).max(MAX_SORTS)),
      filter: z.preprocess(asArray, z.array(filterItem).max(MAX_FILTERS)),
    })
    .transform(
      (query): ListQuery<SortField, FilterField> => ({
        page: query.page,
        pageSize: query.pageSize,
        search: query.search,
        sort: query.sort.length > 0 ? dedupeSorts(query.sort) : [...definition.defaultSort],
        filters: query.filter,
      }),
    );
}

/** Keeps the first occurrence of each sort field (a later duplicate can't change the order). */
function dedupeSorts<Field extends string>(sorts: Sort<Field>[]): Sort<Field>[] {
  const seen = new Set<Field>();
  return sorts.filter((sort) => (seen.has(sort.field) ? false : (seen.add(sort.field), true)));
}

/** `%term%` for ILIKE with the term's own wildcards escaped (PostgreSQL's default escape is `\`). */
export function containsPattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
}

/**
 * Groups filters for SQL compilation: several `is` filters on the same
 * field mean "any of these values" (Figma p41 shows State is Sourced + State
 * is Contacted); every other filter — and different fields — combine with AND.
 */
export function groupFilters<Field extends string>(filters: readonly Filter<Field>[]) {
  const anyOf = new Map<Field, (string | boolean)[]>();
  const all: Filter<Field>[] = [];
  for (const filter of filters) {
    if (filter.operator === "is" && filter.value !== undefined) {
      anyOf.set(filter.field, [...(anyOf.get(filter.field) ?? []), filter.value]);
    } else {
      all.push(filter);
    }
  }
  return { anyOf, all };
}
