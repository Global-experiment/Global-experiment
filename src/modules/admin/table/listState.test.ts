import { describe, expect, it } from "vitest";
import {
  filterButtonLabel,
  isCompleteFilter,
  listStateToApiQuery,
  listStateToUrl,
  pageCount,
  parseFilter,
  readListState,
  type SortRule,
} from "./listState";

const DEFAULT_SORT: SortRule[] = [{ field: "created", direction: "desc" }];

describe("admin list state", () => {
  it("reads defaults from an empty URL", () => {
    expect(readListState(new URLSearchParams(""), DEFAULT_SORT)).toEqual({
      search: "",
      sort: DEFAULT_SORT,
      filters: [],
      page: 1,
    });
  });

  it("round-trips search, sort, filters and page through the URL", () => {
    const state = {
      search: "ana",
      sort: [
        { field: "state", direction: "asc" as const },
        { field: "name", direction: "desc" as const },
      ],
      filters: [
        { field: "state", operator: "is" as const, value: "sourced" },
        { field: "name", operator: "contains" as const, value: "a:b c" },
        { field: "email", operator: "is_empty" as const },
      ],
      page: 3,
    };
    const url = listStateToUrl(state, DEFAULT_SORT);
    expect(readListState(new URLSearchParams(url), DEFAULT_SORT)).toEqual(state);
  });

  it("keeps default-only URLs short", () => {
    expect(listStateToUrl({ search: " ", sort: DEFAULT_SORT, filters: [], page: 1 }, DEFAULT_SORT)).toBe("");
  });

  it("ignores malformed URL parts instead of crashing", () => {
    const state = readListState(new URLSearchParams("sort=name&sort=x:up&filter=nope&filter=a:drop&page=-4"), DEFAULT_SORT);
    expect(state.sort).toEqual(DEFAULT_SORT);
    expect(state.filters).toEqual([]);
    expect(state.page).toBe(1);
  });

  it("builds the API query, leaving out half-edited filters", () => {
    const query = listStateToApiQuery(
      {
        search: "x",
        sort: DEFAULT_SORT,
        filters: [
          { field: "state", operator: "is", value: "" },
          { field: "name", operator: "contains", value: "an" },
          { field: "email", operator: "is_not_empty" },
        ],
        page: 2,
      },
      50,
    );
    const params = new URLSearchParams(query);
    expect(params.get("page")).toBe("2");
    expect(params.get("pageSize")).toBe("50");
    expect(params.get("search")).toBe("x");
    expect(params.getAll("sort")).toEqual(["created:desc"]);
    expect(params.getAll("filter")).toEqual(["name:contains:an", "email:is_not_empty"]);
  });

  it("parses filters whose value contains colons", () => {
    expect(parseFilter("name:contains:a:b")).toEqual({ field: "name", operator: "contains", value: "a:b" });
    expect(isCompleteFilter({ field: "name", operator: "contains", value: "  " })).toBe(false);
  });

  it("labels the filter button like Figma (\"2 filters\")", () => {
    expect(filterButtonLabel([])).toBe("Filter");
    expect(filterButtonLabel([{ field: "a", operator: "is", value: "x" }])).toBe("1 filter");
    expect(
      filterButtonLabel([
        { field: "a", operator: "is", value: "x" },
        { field: "b", operator: "is_empty" },
        { field: "c", operator: "contains", value: "" },
      ]),
    ).toBe("2 filters");
  });

  it("computes page counts", () => {
    expect(pageCount(0, 50)).toBe(1);
    expect(pageCount(101, 50)).toBe(3);
  });
});
