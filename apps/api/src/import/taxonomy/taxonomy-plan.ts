import { LEVELS, type SourceRow, type TaxonomyLevel, type TaxonomySource } from "./taxonomy-source.js";

/**
 * The taxonomy import's rules, as one pure function: Notion rows + what the
 * database holds now → what to create, update, leave, flag, skip and report
 * missing (docs/architecture/data-model.md §5). No I/O here; taxonomy-import.ts
 * loads the snapshot and applies the plan in one transaction.
 *
 * - Matching: Notion page id first, then Stable ID (only rows not linked to
 *   a page yet). Never by name.
 * - Stable IDs: one leading "http://" stripped (Notion auto-links them),
 *   trimmed, validated per level; invalid → stored as NULL and flagged.
 *   A second row with the same Stable ID keeps NULL and is flagged.
 * - A name already used in the same parent: the first row is imported, the
 *   next ones are skipped and reported.
 * - NN.NN that disagrees with the parent's: imported, flagged.
 * - Unknown Status/Team values: that value is skipped and reported.
 * - Parent not found among the imported rows: the row is skipped.
 * - Nothing is ever deleted: database rows Notion doesn't have are reported
 *   as missing (and set to "deprecated" only with --deprecate-missing).
 */

export const STABLE_ID_FORMAT: Record<TaxonomyLevel, RegExp> = {
  domain: /^domain\.[0-9]{2}\.[a-z0-9_]+$/,
  field: /^field\.[0-9]{2}\.[0-9]{2}\.[a-z0-9_]+$/,
  expertise: /^[0-9]{2}\.[0-9]{2}\.[a-z0-9_]+$/,
};
export const NAME_MAX = 120;
export const DEPRECATED = "deprecated";

/** "http://04.01.construction/" (Notion's auto-link) or " 04.01.construction " → "04.01.construction". */
export function cleanStableId(raw: string): { value: string; httpRemoved: boolean } {
  const trimmed = raw.trim();
  const httpRemoved = /^http:\/\//i.test(trimmed);
  const value = httpRemoved ? trimmed.replace(/^http:\/\//i, "").replace(/\/$/, "").trim() : trimmed;
  return { value, httpRemoved };
}

/** The NN (domain) or NN.NN (field, expertise) part of a valid Stable ID. */
export function stableNumber(level: TaxonomyLevel, stableId: string | null): string | null {
  if (!stableId) return null;
  const match =
    level === "domain" ? /^domain\.([0-9]{2})\./.exec(stableId) : level === "field" ? /^field\.([0-9]{2}\.[0-9]{2})\./.exec(stableId) : /^([0-9]{2}\.[0-9]{2})\./.exec(stableId);
  return match?.[1] ?? null;
}

/** A taxonomy row as the database holds it now. */
export interface DbNode {
  level: TaxonomyLevel;
  id: string;
  name: string;
  stableId: string | null;
  statusKey: string | null;
  notionPageId: string | null;
  /** domain_id / field_id; null for domains. */
  parentId: string | null;
  /** Team keys (expertise only). */
  teams: string[];
}

export interface Vocabulary {
  key: string;
  label: string;
}

export interface DbSnapshot {
  nodes: DbNode[];
  statuses: Vocabulary[];
  teams: Vocabulary[];
}

export type IssueCode =
  | "invalid_stable_id"
  | "duplicate_stable_id"
  | "stable_id_taken"
  | "nn_mismatch"
  | "unknown_status"
  | "unknown_team"
  | "empty_name"
  | "name_too_long"
  | "unresolved_parent"
  | "multiple_parents"
  | "duplicate_name"
  | "name_taken"
  | "missing_from_notion";

/** flagged: the row is imported with this caveat; skipped: the row isn't imported; value_skipped: one value was left out; missing: in the database, not in Notion. */
export type IssueKind = "flagged" | "skipped" | "value_skipped" | "missing";

export interface Issue {
  level: TaxonomyLevel;
  kind: IssueKind;
  code: IssueCode;
  name: string;
  pageId?: string;
  dbId?: string;
  detail: string;
}

export interface PlannedRow {
  level: TaxonomyLevel;
  pageId: string;
  action: "create" | "update" | "unchanged";
  dbId: string | null;
  matchedBy: "page" | "stable_id" | null;
  name: string;
  stableId: string | null;
  statusKey: string | null;
  /** The parent's Notion page id (null for domains); resolved to a database id when applying. */
  parentPageId: string | null;
  /** What differs from the database: name, stableId, statusKey, notionPageId, parent, teams. */
  changes: string[];
  teamsAdd: string[];
  teamsRemove: string[];
  httpRemoved: boolean;
}

export interface MissingRow {
  level: TaxonomyLevel;
  dbId: string;
  name: string;
  stableId: string | null;
  /** True when --deprecate-missing will set it to "deprecated" (it isn't already). */
  deprecate: boolean;
}

export interface LevelPlan {
  rows: PlannedRow[];
  skipped: number;
  missing: MissingRow[];
}

export interface TaxonomyPlan {
  levels: Record<TaxonomyLevel, LevelPlan>;
  issues: Issue[];
  deprecateMissing: boolean;
}

export interface LevelCounts {
  created: number;
  updated: number;
  unchanged: number;
  flagged: number;
  skipped: number;
  missing: number;
  deprecated: number;
}

export interface PlanCounts {
  domain: LevelCounts;
  field: LevelCounts;
  expertise: LevelCounts;
  teamLinks: { added: number; removed: number };
  /** Rows created + updated + deprecated + team links changed: 0 means the database already matches Notion. */
  changes: number;
}

const byCreation = (a: SourceRow, b: SourceRow) => a.createdTime.localeCompare(b.createdTime) || a.pageId.localeCompare(b.pageId);
const nameKey = (name: string) => name.trim().toLowerCase();
const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((value) => b.includes(value));

function vocabularyMatcher(entries: Vocabulary[]) {
  const map = new Map<string, string>();
  for (const { key, label } of entries) {
    map.set(key.toLowerCase(), key);
    map.set(label.trim().toLowerCase(), key);
  }
  return (name: string) => map.get(name.trim().toLowerCase()) ?? map.get(name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_"));
}

interface ParentInfo {
  dbId: string | null;
  number: string | null;
}

export function planTaxonomyImport(source: TaxonomySource, snapshot: DbSnapshot, options: { deprecateMissing?: boolean } = {}): TaxonomyPlan {
  const issues: Issue[] = [];
  const status = vocabularyMatcher(snapshot.statuses);
  const team = vocabularyMatcher(snapshot.teams);
  const levels = {} as Record<TaxonomyLevel, LevelPlan>;
  let parents = new Map<string, ParentInfo>();

  const rowsOf: Record<TaxonomyLevel, SourceRow[]> = { domain: source.domains, field: source.fields, expertise: source.expertise };

  for (const level of LEVELS) {
    const nodes = snapshot.nodes.filter((node) => node.level === level);
    const byPage = new Map(nodes.filter((node) => node.notionPageId).map((node) => [node.notionPageId!, node]));
    const unlinkedByStable = new Map(nodes.filter((node) => !node.notionPageId && node.stableId).map((node) => [node.stableId!, node]));
    const claimed = new Set<string>();
    const issue = (row: SourceRow, kind: IssueKind, code: IssueCode, detail: string, name = row.name.trim() || "(no name)") =>
      issues.push({ level, kind, code, name, pageId: row.pageId, detail });

    // Pass 1 — clean, match (page id, then Stable ID), resolve the parent.
    interface Candidate {
      row: SourceRow;
      node: DbNode | undefined;
      matchedBy: PlannedRow["matchedBy"];
      name: string;
      stableId: string | null;
      httpRemoved: boolean;
      parentPageId: string | null;
      parent: ParentInfo | null;
      skip: boolean;
    }
    const candidates: Candidate[] = [];
    for (const row of [...rowsOf[level]].sort(byCreation)) {
      const name = row.name.trim();
      const cleaned = cleanStableId(row.rawStableId);
      let stableId: string | null = cleaned.value || null;
      if (stableId && !STABLE_ID_FORMAT[level].test(stableId)) {
        issue(row, "flagged", "invalid_stable_id", `"${row.rawStableId}" isn't a valid ${level} Stable ID; stored as empty.`);
        stableId = null;
      }

      let node = byPage.get(row.pageId);
      let matchedBy: PlannedRow["matchedBy"] = node ? "page" : null;
      if (!node && stableId) {
        const byStable = unlinkedByStable.get(stableId);
        if (byStable && !claimed.has(byStable.id)) {
          node = byStable;
          matchedBy = "stable_id";
        }
      }
      if (node) claimed.add(node.id);

      let skip = false;
      if (!name) {
        issue(row, "skipped", "empty_name", "The Notion row has no name.");
        skip = true;
      } else if (name.length > NAME_MAX) {
        issue(row, "skipped", "name_too_long", `The name is ${name.length} characters (max ${NAME_MAX}).`);
        skip = true;
      }

      let parentPageId: string | null = null;
      let parent: ParentInfo | null = null;
      if (!skip && level !== "domain") {
        const parentLevel = level === "field" ? "domain" : "field";
        if (row.parentPageIds.length === 0) {
          issue(row, "skipped", "unresolved_parent", `No ${parentLevel} is set in Notion.`);
          skip = true;
        } else if (row.parentPageIds.length > 1) {
          issue(row, "skipped", "multiple_parents", `${row.parentPageIds.length} ${parentLevel}s are set in Notion; exactly one is expected.`);
          skip = true;
        } else {
          parentPageId = row.parentPageIds[0]!;
          parent = parents.get(parentPageId) ?? null;
          if (!parent) {
            issue(row, "skipped", "unresolved_parent", `Its ${parentLevel} (Notion page ${parentPageId}) isn't among the imported ${parentLevel}s.`);
            skip = true;
          }
        }
      }
      candidates.push({ row, node, matchedBy, name, stableId, httpRemoved: cleaned.httpRemoved, parentPageId, parent, skip });
    }

    // Database rows this run doesn't touch keep their Stable IDs and names.
    const untouched = nodes.filter((node) => !claimed.has(node.id));
    const heldStable = new Set(untouched.map((node) => node.stableId).filter(Boolean) as string[]);
    const parentKey = (parentDbId: string | null, parentPageId: string | null) => (level === "domain" ? "root" : parentDbId ? `db:${parentDbId}` : `page:${parentPageId}`);
    const occupiedNames = new Set(untouched.map((node) => `${level === "domain" ? "root" : `db:${node.parentId}`}|${nameKey(node.name)}`));

    // Pass 2 — duplicates (first wins), vocabularies, NN.NN, and the action.
    const seenStable = new Map<string, string>();
    const seenNames = new Map<string, string>();
    const rows: PlannedRow[] = [];
    let skipped = 0;
    const nextParents = new Map<string, ParentInfo>();

    for (const candidate of candidates) {
      const { row, node } = candidate;
      if (candidate.skip) {
        skipped++;
        continue;
      }
      const key = `${parentKey(candidate.parent?.dbId ?? null, candidate.parentPageId)}|${nameKey(candidate.name)}`;
      const firstWithName = seenNames.get(key);
      if (firstWithName) {
        issue(row, "skipped", "duplicate_name", `Same name as Notion page ${firstWithName} in the same ${level === "expertise" ? "field" : level === "field" ? "domain" : "taxonomy"}; the first one is imported.`);
        skipped++;
        continue;
      }
      if (occupiedNames.has(key)) {
        issue(row, "skipped", "name_taken", "A database row that isn't linked to this Notion page already has this name in the same parent (rows are never matched by name).");
        skipped++;
        continue;
      }
      seenNames.set(key, row.pageId);

      let stableId = candidate.stableId;
      if (stableId) {
        const first = seenStable.get(stableId);
        if (first) {
          issue(row, "flagged", "duplicate_stable_id", `Stable ID "${stableId}" is already used by Notion page ${first}; stored as empty.`);
          stableId = null;
        } else if (heldStable.has(stableId)) {
          issue(row, "flagged", "stable_id_taken", `Stable ID "${stableId}" belongs to a database row Notion doesn't have any more; stored as empty.`);
          stableId = null;
        } else {
          seenStable.set(stableId, row.pageId);
        }
      }

      const number = stableNumber(level, stableId);
      if (level !== "domain" && number && candidate.parent?.number) {
        const own = level === "field" ? number.slice(0, 2) : number;
        if (own !== candidate.parent.number) {
          issue(row, "flagged", "nn_mismatch", `Stable ID ${stableId} doesn't start with its ${level === "field" ? "domain" : "field"}'s ${candidate.parent.number}.`);
        }
      }

      let statusKey: string | null = null;
      if (row.status) {
        const known = status(row.status);
        if (known) statusKey = known;
        else {
          issues.push({ level, kind: "value_skipped", code: "unknown_status", name: candidate.name, pageId: row.pageId, detail: `Unknown status "${row.status}" left out.` });
          statusKey = node?.statusKey ?? null; // keep what the database had
        }
      }

      const teams: string[] = [];
      for (const teamName of row.teams) {
        const known = team(teamName);
        if (!known) {
          issues.push({ level, kind: "value_skipped", code: "unknown_team", name: candidate.name, pageId: row.pageId, detail: `Unknown team "${teamName}" left out.` });
        } else if (!teams.includes(known)) teams.push(known);
      }

      const parentDbId = candidate.parent?.dbId ?? null;
      const changes: string[] = [];
      let teamsAdd: string[] = [];
      let teamsRemove: string[] = [];
      if (node) {
        if (node.name !== candidate.name) changes.push("name");
        if (node.stableId !== stableId) changes.push("stableId");
        if (node.statusKey !== statusKey) changes.push("statusKey");
        if (node.notionPageId !== row.pageId) changes.push("notionPageId");
        if (level !== "domain" && (parentDbId === null || node.parentId !== parentDbId)) changes.push("parent");
        if (level === "expertise" && !sameSet(node.teams, teams)) {
          changes.push("teams");
          teamsAdd = teams.filter((key) => !node.teams.includes(key));
          teamsRemove = node.teams.filter((key) => !teams.includes(key));
        }
      } else {
        teamsAdd = teams;
      }

      rows.push({
        level,
        pageId: row.pageId,
        action: node ? (changes.length > 0 ? "update" : "unchanged") : "create",
        dbId: node?.id ?? null,
        matchedBy: candidate.matchedBy,
        name: candidate.name,
        stableId,
        statusKey,
        parentPageId: candidate.parentPageId,
        changes,
        teamsAdd,
        teamsRemove,
        httpRemoved: candidate.httpRemoved,
      });
      nextParents.set(row.pageId, { dbId: node?.id ?? null, number });
    }

    const missing: MissingRow[] = untouched.map((node) => ({
      level,
      dbId: node.id,
      name: node.name,
      stableId: node.stableId,
      deprecate: Boolean(options.deprecateMissing) && node.statusKey !== DEPRECATED,
    }));
    for (const row of missing) {
      issues.push({
        level,
        kind: "missing",
        code: "missing_from_notion",
        name: row.name,
        dbId: row.dbId,
        detail: row.deprecate ? 'Not in Notion; set to "deprecated".' : `Not in Notion${row.stableId ? ` (Stable ID ${row.stableId})` : ""}; left as it is.`,
      });
    }

    // Children of a skipped row see no parent and are skipped in turn.
    parents = nextParents;
    levels[level] = { rows, skipped, missing };
  }

  return { levels, issues, deprecateMissing: Boolean(options.deprecateMissing) };
}

export function countPlan(plan: TaxonomyPlan): PlanCounts {
  const level = (name: TaxonomyLevel): LevelCounts => {
    const { rows, skipped, missing } = plan.levels[name];
    const flaggedPages = new Set(plan.issues.filter((issue) => issue.level === name && issue.kind === "flagged").map((issue) => issue.pageId));
    return {
      created: rows.filter((row) => row.action === "create").length,
      updated: rows.filter((row) => row.action === "update").length,
      unchanged: rows.filter((row) => row.action === "unchanged").length,
      flagged: flaggedPages.size,
      skipped,
      missing: missing.length,
      deprecated: missing.filter((row) => row.deprecate).length,
    };
  };
  const counts = { domain: level("domain"), field: level("field"), expertise: level("expertise") };
  const items = plan.levels.expertise.rows;
  const teamLinks = {
    added: items.reduce((sum, row) => sum + row.teamsAdd.length, 0),
    removed: items.reduce((sum, row) => sum + row.teamsRemove.length, 0),
  };
  const changes =
    LEVELS.reduce((sum, name) => sum + counts[name].created + counts[name].updated + counts[name].deprecated, 0) + teamLinks.added + teamLinks.removed;
  return { ...counts, teamLinks, changes };
}
