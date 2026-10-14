import type { ExpertiseTree, VocabularyEntry } from "../api/types";
import type { ListField } from "../table/fields";
import type { LocalListSpec } from "../table/localList";

export type TaxonomyLevel = "domain" | "field" | "expertise";

/** One row of a taxonomy screen, whatever the level. */
export interface TaxonomyRow {
  id: string;
  name: string;
  stableId: string | null;
  status: VocabularyEntry | null;
  domain: { id: string; name: string };
  field: { id: string; name: string } | null;
  teams: VocabularyEntry[];
  fieldCount: number;
  itemCount: number;
  peopleCount: number;
  organizationCount: number;
}

/** The tree flattened to one level's rows, in domain → field → name order. */
export function taxonomyRows(level: TaxonomyLevel, tree: ExpertiseTree): TaxonomyRow[] {
  const byName = <T extends { name: string }>(list: readonly T[]) => [...list].sort((a, b) => a.name.localeCompare(b.name));
  return byName(tree.domains).flatMap((domain): TaxonomyRow[] => {
    const items = domain.fields.flatMap((field) => field.items);
    const usage = (list: typeof items) => ({
      peopleCount: list.reduce((sum, item) => sum + item.peopleCount, 0),
      organizationCount: list.reduce((sum, item) => sum + item.organizationCount, 0),
    });
    const domainRef = { id: domain.id, name: domain.name };
    if (level === "domain") {
      return [{ id: domain.id, name: domain.name, stableId: domain.stableId, status: domain.status, domain: domainRef, field: null, teams: [], fieldCount: domain.fields.length, itemCount: items.length, ...usage(items) }];
    }
    return byName(domain.fields).flatMap((field): TaxonomyRow[] => {
      const fieldRef = { id: field.id, name: field.name };
      if (level === "field") {
        return [{ id: field.id, name: field.name, stableId: field.stableId, status: field.status, domain: domainRef, field: null, teams: [], fieldCount: 0, itemCount: field.items.length, ...usage(field.items) }];
      }
      return byName(field.items).map((item) => ({
        id: item.id,
        name: item.name,
        stableId: item.stableId,
        status: item.status,
        domain: domainRef,
        field: fieldRef,
        teams: item.teams,
        fieldCount: 0,
        itemCount: 0,
        peopleCount: item.peopleCount,
        organizationCount: item.organizationCount,
      }));
    });
  });
}

const NO_STATUS = "none";

/**
 * What the list toolbar can filter and sort on, per level (filters run in
 * the browser over the loaded tree — see table/localList.ts). Domain and
 * field filter by id (names can repeat across domains) and sort by name.
 */
export function taxonomyListSpec(level: TaxonomyLevel): LocalListSpec<TaxonomyRow> {
  return {
    values: {
      name: (row) => row.name,
      stable_id: (row) => row.stableId,
      status: (row) => row.status?.key ?? NO_STATUS,
      domain: (row) => row.domain.id,
      field: (row) => row.field?.id ?? null,
      team: (row) => row.teams.map((team) => team.key),
      fields: (row) => row.fieldCount,
      expertise: (row) => row.itemCount,
      people: (row) => row.peopleCount,
      organizations: (row) => row.organizationCount,
    },
    sortValues: {
      status: (row) => row.status?.label ?? null,
      domain: (row) => row.domain.name,
      field: (row) => row.field?.name ?? null,
    },
    searchText: (row) => [row.name, row.stableId, ...(level === "expertise" ? [row.field?.name ?? null, row.domain.name] : [])],
  };
}

export function taxonomyFields(level: TaxonomyLevel, rows: readonly TaxonomyRow[]): ListField[] {
  const unique = (entries: [string, string][]) => [...new Map(entries)].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  const statuses = unique(rows.map((row) => [row.status?.key ?? NO_STATUS, row.status?.label ?? "No status"]));
  const domains = unique(rows.map((row) => [row.domain.id, row.domain.name]));
  const fields = unique(rows.flatMap((row): [string, string][] => (row.field ? [[row.field.id, `${row.field.name} · ${row.domain.name}`]] : [])));
  const teams = unique(rows.flatMap((row) => row.teams.map((team): [string, string] => [team.key, team.label])));
  const count = (id: string, label: string): ListField => ({ id, label, icon: "numbers", operators: [], sort: "text" });
  return [
    { id: "name", label: "Name", icon: "title", operators: ["contains", "not_contains"], sort: "text" },
    { id: "stable_id", label: "Stable ID", icon: "title", operators: ["contains", "is_empty", "is_not_empty"], sort: "text" },
    { id: "status", label: "Status", icon: "select", operators: ["is", "is_not"], options: statuses, sort: "text" },
    ...(level === "domain" ? [] : [{ id: "domain", label: "Domain", icon: "arrow_outward", operators: ["is", "is_not"], options: domains, sort: "text" } satisfies ListField]),
    ...(level === "expertise"
      ? [
          { id: "field", label: "Field", icon: "arrow_outward", operators: ["is", "is_not"], options: fields, sort: "text" } satisfies ListField,
          { id: "team", label: "Teams", icon: "select", operators: ["is", "is_not", "is_empty", "is_not_empty"], options: teams } satisfies ListField,
        ]
      : []),
    ...(level === "domain" ? [count("fields", "Fields")] : []),
    ...(level === "expertise" ? [] : [count("expertise", "Expertise")]),
    count("people", "People"),
    count("organizations", "Organizations"),
  ];
}
