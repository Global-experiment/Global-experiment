import { z } from "zod";
import { describe, expect, it } from "vitest";
import { containsPattern, groupFilters, listQuerySchema } from "./list-query.js";

const schema = listQuerySchema({
  sortFields: ["name", "created"] as const,
  defaultSort: [{ field: "created", direction: "desc" }],
  filters: {
    state: { operators: ["is", "is_not", "is_empty"], value: z.string().regex(/^[a-z_]+$/) },
    name: { operators: ["contains"] },
  },
});

describe("list query contract", () => {
  it("applies defaults", () => {
    expect(schema.parse({})).toEqual({
      page: 1,
      pageSize: 50,
      search: undefined,
      sort: [{ field: "created", direction: "desc" }],
      filters: [],
    });
  });

  it("parses pagination, search, repeated sort and filters", () => {
    const query = schema.parse({
      page: "3",
      pageSize: "20",
      search: "  ana ",
      sort: ["name:asc", "created:desc", "name:desc"],
      filter: ["state:is:sourced", "state:is_empty", "name:contains:a:b"],
    });
    expect(query.page).toBe(3);
    expect(query.pageSize).toBe(20);
    expect(query.search).toBe("ana");
    expect(query.sort).toEqual([
      { field: "name", direction: "asc" },
      { field: "created", direction: "desc" },
    ]);
    expect(query.filters).toEqual([
      { field: "state", operator: "is", value: "sourced" },
      { field: "state", operator: "is_empty" },
      { field: "name", operator: "contains", value: "a:b" },
    ]);
  });

  it.each([
    [{ pageSize: "500" }],
    [{ page: "0" }],
    [{ sort: "password:asc" }],
    [{ sort: "name:sideways" }],
    [{ filter: "secret:is:x" }],
    [{ filter: "state:contains:x" }],
    [{ filter: "state:is" }],
    [{ filter: "state:is_empty:x" }],
    [{ filter: "state:is:DROP TABLE" }],
    [{ filter: "__proto__:is:x" }],
    [{ search: "x".repeat(201) }],
  ])("rejects %j", (input) => {
    expect(schema.safeParse(input).success).toBe(false);
  });

  it("escapes LIKE wildcards", () => {
    expect(containsPattern("50%_off\\")).toBe("%50\\%\\_off\\\\%");
  });

  it("ORs repeated `is` filters on one field and ANDs everything else", () => {
    const { anyOf, all } = groupFilters([
      { field: "state", operator: "is", value: "sourced" },
      { field: "state", operator: "is", value: "contacted" },
      { field: "name", operator: "contains", value: "a" },
    ]);
    expect(anyOf.get("state")).toEqual(["sourced", "contacted"]);
    expect(all).toEqual([{ field: "name", operator: "contains", value: "a" }]);
  });
});
