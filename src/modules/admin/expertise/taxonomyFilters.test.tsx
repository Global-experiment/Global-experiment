import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ExpertiseTree } from "../api/types";
import type { FilterRule, ListState } from "../table/listState";
import { applyListState } from "../table/localList";
import { TaxonomyScreen } from "./TaxonomyScreen";
import { taxonomyFields, taxonomyListSpec, taxonomyRows } from "./taxonomyFilters";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: () => undefined, push: () => undefined }),
  usePathname: () => "/admin/expertise",
  useSearchParams: () => new URLSearchParams(),
}));

// Test fixtures only.
const status = (key: string, label: string) => ({ key, label });
const tree: ExpertiseTree = {
  domains: [
    {
      id: "d2",
      name: "Science",
      stableId: "domain.01.science",
      status: status("active", "Active"),
      fields: [
        {
          id: "f3",
          name: "Physics",
          stableId: "field.01.01.physics",
          status: status("active", "Active"),
          items: [{ id: "i4", name: "Optics", stableId: "01.01.optics", status: status("active", "Active"), teams: [status("tech", "Tech")], peopleCount: 2, organizationCount: 0 }],
        },
      ],
    },
    {
      id: "d1",
      name: "Government",
      stableId: "domain.07.government",
      status: status("active", "Active"),
      fields: [
        {
          id: "f1",
          name: "Participation",
          stableId: "field.07.02.participation",
          status: status("active", "Active"),
          items: [
            { id: "i1", name: "Citizen assemblies", stableId: "07.02.citizen_assemblies", status: status("active", "Active"), teams: [status("moderation", "Moderation")], peopleCount: 3, organizationCount: 1 },
            { id: "i2", name: "Petitions", stableId: "07.02.petitions", status: status("deprecated", "Deprecated"), teams: [], peopleCount: 1, organizationCount: 0 },
          ],
        },
        { id: "f2", name: "Administration", stableId: null, status: null, items: [{ id: "i3", name: "Procurement", stableId: null, status: null, teams: [], peopleCount: 0, organizationCount: 2 }] },
      ],
    },
  ],
};

describe("taxonomy screen filters", () => {
  it("flattens each level in domain → field → name order, with usage counts", () => {
    expect(taxonomyRows("domain", tree).map((row) => [row.name, row.fieldCount, row.itemCount, row.peopleCount, row.organizationCount])).toEqual([
      ["Government", 2, 3, 4, 3],
      ["Science", 1, 1, 2, 0],
    ]);
    expect(taxonomyRows("field", tree).map((row) => [row.name, row.domain.name, row.itemCount])).toEqual([
      ["Administration", "Government", 1],
      ["Participation", "Government", 2],
      ["Physics", "Science", 1],
    ]);
    expect(taxonomyRows("expertise", tree).map((row) => row.name)).toEqual(["Procurement", "Citizen assemblies", "Petitions", "Optics"]);
  });

  const state = (parts: Partial<ListState>): ListState => ({ search: "", sort: [], filters: [], page: 1, ...parts });
  const names = (filters: FilterRule[], parts: Partial<ListState> = {}) =>
    applyListState(taxonomyRows("expertise", tree), taxonomyListSpec("expertise"), state({ filters, ...parts }), 50).items.map((row) => row.name);

  it("filters expertise by domain, field, status, team, and searches name, Stable ID, field and domain", () => {
    expect(names([{ field: "domain", operator: "is", value: "d1" }])).toEqual(["Procurement", "Citizen assemblies", "Petitions"]);
    expect(names([{ field: "field", operator: "is", value: "f1" }])).toEqual(["Citizen assemblies", "Petitions"]);
    expect(names([{ field: "status", operator: "is", value: "deprecated" }])).toEqual(["Petitions"]);
    expect(names([{ field: "status", operator: "is", value: "none" }])).toEqual(["Procurement"]);
    expect(names([{ field: "team", operator: "is", value: "moderation" }])).toEqual(["Citizen assemblies"]);
    expect(names([{ field: "team", operator: "is_empty" }])).toEqual(["Procurement", "Petitions"]);
    expect(names([{ field: "stable_id", operator: "is_empty" }])).toEqual(["Procurement"]);
    expect(names([], { search: "07.02.pet" })).toEqual(["Petitions"]);
    expect(names([], { search: "OPTI" })).toEqual(["Optics"]);
    expect(names([], { search: "physics" })).toEqual(["Optics"]);
    // Filters AND together; incomplete rows (no value yet) are ignored.
    expect(
      names([
        { field: "domain", operator: "is", value: "d1" },
        { field: "status", operator: "is", value: "active" },
        { field: "name", operator: "contains", value: "" },
      ]),
    ).toEqual(["Citizen assemblies"]);
  });

  it("sorts by several rules (by name where the filter uses ids), empty values last, and pages", () => {
    expect(names([], { sort: [{ field: "people", direction: "desc" }] })).toEqual(["Citizen assemblies", "Optics", "Petitions", "Procurement"]);
    expect(names([], { sort: [{ field: "domain", direction: "desc" }, { field: "name", direction: "asc" }] })).toEqual(["Optics", "Citizen assemblies", "Petitions", "Procurement"]);
    expect(names([], { sort: [{ field: "stable_id", direction: "desc" }] }).at(-1)).toBe("Procurement");
    const page2 = applyListState(taxonomyRows("expertise", tree), taxonomyListSpec("expertise"), state({ page: 2 }), 3);
    expect([page2.page, page2.total, page2.items.map((row) => row.name)]).toEqual([2, 4, ["Optics"]]);
  });

  it("offers each level only its own filters, with choices from the data", () => {
    const ids = (level: "domain" | "field" | "expertise") => taxonomyFields(level, taxonomyRows(level, tree)).map((field) => field.id);
    expect(ids("domain")).toEqual(["name", "stable_id", "status", "fields", "expertise", "people", "organizations"]);
    expect(ids("field")).toEqual(["name", "stable_id", "status", "domain", "expertise", "people", "organizations"]);
    expect(ids("expertise")).toEqual(["name", "stable_id", "status", "domain", "field", "team", "people", "organizations"]);
    const field = taxonomyFields("expertise", taxonomyRows("expertise", tree)).find((candidate) => candidate.id === "field")!;
    expect(field.options).toEqual([
      { value: "f2", label: "Administration · Government" },
      { value: "f1", label: "Participation · Government" },
      { value: "f3", label: "Physics · Science" },
    ]);
  });

  it("renders read-only, with no import, no Notion label and no editing controls (decision of 2026-10-23)", () => {
    const html = renderToStaticMarkup(<TaxonomyScreen level="expertise" />);
    expect(html).not.toContain("Managed in Notion");
    expect(html).not.toContain('href="/admin/imports"');
    expect(html).not.toMatch(/Import|Export/);
    expect(html).not.toMatch(/Rename|Delete|New expertise/);
  });
});
