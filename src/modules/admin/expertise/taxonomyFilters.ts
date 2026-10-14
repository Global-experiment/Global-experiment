import type { ExpertiseTree, VocabularyEntry } from "../api/types";

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

export interface TaxonomyFilter {
  /** Name or Stable ID, case-insensitive. */
  q: string;
  domainId: string;
  fieldId: string;
  /** A status key; "none" for rows without a status. */
  status: string;
  team: string;
}

export const EMPTY_FILTER: TaxonomyFilter = { q: "", domainId: "", fieldId: "", status: "", team: "" };

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

export function filterTaxonomyRows(level: TaxonomyLevel, rows: readonly TaxonomyRow[], filter: TaxonomyFilter): TaxonomyRow[] {
  const q = filter.q.trim().toLowerCase();
  return rows.filter((row) => {
    if (q && !row.name.toLowerCase().includes(q) && !(row.stableId ?? "").toLowerCase().includes(q)) return false;
    if (filter.status && (row.status?.key ?? "none") !== filter.status) return false;
    if (level !== "domain" && filter.domainId && row.domain.id !== filter.domainId) return false;
    if (level === "expertise" && filter.fieldId && row.field?.id !== filter.fieldId) return false;
    if (level === "expertise" && filter.team && !row.teams.some((team) => team.key === filter.team)) return false;
    return true;
  });
}
