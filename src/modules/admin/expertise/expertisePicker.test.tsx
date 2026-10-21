import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ExpertiseRef, ExpertiseSearchItem } from "../api/types";
import { RelationPicker } from "../ui/RelationPicker";
import { ExpertiseField } from "./ExpertiseField";
import { expertisePath, expertiseRollup, linkedExpertiseOption, searchResultOption } from "./expertiseOptions";

// Test fixtures only.
const active = { key: "active", label: "Active" };
const ref = (id: string, name: string, field: [string, string], domain: [string, string], status: ExpertiseRef["status"] = active): ExpertiseRef => ({
  id,
  name,
  stableId: `07.02.${id}`,
  status,
  field: { id: field[0], name: field[1] },
  domain: { id: domain[0], name: domain[1] },
});
const assemblies = ref("a", "Citizen assemblies", ["f1", "Participation"], ["d1", "Government"]);
const petitions = ref("p", "Petitions", ["f1", "Participation"], ["d1", "Government"], { key: "deprecated", label: "Deprecated" });
const optics = ref("o", "Optics", ["f2", "Physics"], ["d2", "Science"]);
const search = (item: ExpertiseRef, extra: Partial<ExpertiseSearchItem> = {}): ExpertiseSearchItem => ({
  ...item,
  path: expertisePath(item),
  teams: [{ key: "moderation", label: "Moderation" }],
  selectable: item.status?.key === "active",
  ...extra,
});

describe("expertise picker options", () => {
  it("shows linked expertise with its full path as a tooltip, greyed out unless Active", () => {
    expect(linkedExpertiseOption(assemblies)).toMatchObject({ label: "Citizen assemblies", title: "Government > Participation > Citizen assemblies", muted: false });
    expect(linkedExpertiseOption(petitions)).toMatchObject({ title: "Government > Participation > Petitions (Deprecated)", muted: true });
  });

  it("turns search results into options with path, team chips, and Proposed/Deprecated not pickable", () => {
    expect(searchResultOption(search(assemblies))).toMatchObject({
      label: "Citizen assemblies",
      detail: "Government > Participation",
      tags: ["Moderation"],
      disabled: false,
    });
    expect(searchResultOption(search(petitions))).toMatchObject({
      disabled: true,
      muted: true,
      disabledReason: "Deprecated: only Active expertise can be added",
    });
  });

  it("rolls the links up to their Fields and Domains (each once, by name) — computed, not stored", () => {
    const options = [assemblies, petitions, optics].map(linkedExpertiseOption);
    expect(expertiseRollup(options)).toEqual({
      fields: [
        { id: "f1", name: "Participation" },
        { id: "f2", name: "Physics" },
      ],
      domains: [
        { id: "d1", name: "Government" },
        { id: "d2", name: "Science" },
      ],
    });
    expect(expertiseRollup([])).toEqual({ fields: [], domains: [] });
  });
});

describe("expertise picker rendering", () => {
  const noSearch = async () => [];

  it("renders linked expertise as chips with the path tooltip and a remove button each", () => {
    const html = renderToStaticMarkup(
      <RelationPicker label="Expertise" selected={[linkedExpertiseOption(assemblies), linkedExpertiseOption(petitions)]} onChange={() => undefined} search={noSearch} />,
    );
    expect(html).toContain('aria-label="Linked expertise"');
    expect(html).toContain('title="Government &gt; Participation &gt; Citizen assemblies"');
    expect(html).toContain('aria-label="Remove Citizen assemblies"');
    // The Deprecated one is greyed out, and its status is readable by screen readers.
    expect(html).toMatch(/data-muted="true"[^>]*title="Government &gt; Participation &gt; Petitions \(Deprecated\)"|title="Government &gt; Participation &gt; Petitions \(Deprecated\)"[^>]*data-muted="true"/);
    expect(html).toContain('<span class="sr-only">Government &gt; Participation &gt; Petitions (Deprecated)</span>');
    // Figma's inline search line (a combobox), not an "Add" button.
    expect(html).toContain('role="combobox"');
    expect(html).toContain('placeholder="Search"');
  });

  it("shows the Fields / Domains rollup under the chips", () => {
    const hint = "People can have up to 10 expertise.";
    const html = renderToStaticMarkup(<ExpertiseField selected={[assemblies, optics].map(linkedExpertiseOption)} onChange={() => undefined} limitMessage={hint} />);
    expect(html).toContain('aria-label="Expertise rollup"');
    expect(html).toContain("<dt>Fields</dt><dd>Participation, Physics</dd>");
    expect(html).toContain("<dt>Domains</dt><dd>Government, Science</dd>");
    expect(renderToStaticMarkup(<ExpertiseField selected={[]} onChange={() => undefined} limitMessage={hint} />)).not.toContain("Expertise rollup");
  });

  it("links a chip's label to the record when the option has one", () => {
    const html = renderToStaticMarkup(
      <RelationPicker label="Organization" selected={[{ id: "o1", label: "Civic Lab", href: "/admin/organizations/o1" }]} onChange={() => undefined} search={noSearch} />,
    );
    expect(html).toContain('href="/admin/organizations/o1"');
    expect(html).toContain('aria-label="Linked organization"');
  });
});
