import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ExpertiseTree } from "../api/types";
import { TaxonomyScreen } from "./TaxonomyScreen";
import { EMPTY_FILTER, filterTaxonomyRows, taxonomyRows } from "./taxonomyFilters";

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

  it("filters expertise by domain, field, status, team, and name or Stable ID", () => {
    const rows = taxonomyRows("expertise", tree);
    const names = (filter: Partial<typeof EMPTY_FILTER>) => filterTaxonomyRows("expertise", rows, { ...EMPTY_FILTER, ...filter }).map((row) => row.name);
    expect(names({ domainId: "d1" })).toEqual(["Procurement", "Citizen assemblies", "Petitions"]);
    expect(names({ fieldId: "f1" })).toEqual(["Citizen assemblies", "Petitions"]);
    expect(names({ status: "deprecated" })).toEqual(["Petitions"]);
    expect(names({ status: "none" })).toEqual(["Procurement"]);
    expect(names({ team: "moderation" })).toEqual(["Citizen assemblies"]);
    expect(names({ q: "07.02.pet" })).toEqual(["Petitions"]);
    expect(names({ q: "OPTI" })).toEqual(["Optics"]);
    expect(names({ domainId: "d1", status: "active" })).toEqual(["Citizen assemblies"]);
  });

  it("ignores filters that don't apply to the level", () => {
    const domains = taxonomyRows("domain", tree);
    expect(filterTaxonomyRows("domain", domains, { ...EMPTY_FILTER, domainId: "d2", team: "tech" }).map((row) => row.name)).toEqual(["Government", "Science"]);
  });

  it("renders read-only, with the Notion note and no editing controls", () => {
    const html = renderToStaticMarkup(<TaxonomyScreen level="expertise" />);
    expect(html).toContain("Managed in Notion – updated by the importer.");
    expect(html).toContain('href="/admin/imports"');
    expect(html).toContain('aria-label="Filter expertise"');
    expect(html).not.toMatch(/Rename|Delete|New expertise/);
  });
});
