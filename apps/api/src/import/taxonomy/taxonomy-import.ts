import { and, asc, eq, inArray } from "drizzle-orm";
import type { Database } from "../../common/database/database.module.js";
import { expertiseDomains, expertiseFields, expertiseItems, expertiseTeams, taxonomyStatuses, teams } from "../../expertise/expertise.schema.js";
import { runImport } from "../import-run.js";
import { countPlan, DEPRECATED, planTaxonomyImport, type DbSnapshot, type Issue, type PlanCounts, type TaxonomyPlan } from "./taxonomy-plan.js";
import { LEVELS, type TaxonomyLevel, type TaxonomySource } from "./taxonomy-source.js";

type Executor = Pick<Database, "select" | "insert" | "update" | "delete">;

const TABLE = { domain: expertiseDomains, field: expertiseFields, expertise: expertiseItems } as const;

/** What the taxonomy tables hold now, in the planner's terms. */
export async function loadTaxonomySnapshot(db: Executor): Promise<DbSnapshot> {
  const [domains, fields, items, links, statuses, teamRows] = await Promise.all([
    db.select().from(expertiseDomains),
    db.select().from(expertiseFields),
    db.select().from(expertiseItems),
    db.select().from(expertiseTeams),
    db.select({ key: taxonomyStatuses.key, label: taxonomyStatuses.label }).from(taxonomyStatuses).orderBy(asc(taxonomyStatuses.sortOrder)),
    db.select({ key: teams.key, label: teams.label }).from(teams).orderBy(asc(teams.sortOrder)),
  ]);
  const teamsByItem = new Map<string, string[]>();
  for (const link of links) teamsByItem.set(link.expertiseId, [...(teamsByItem.get(link.expertiseId) ?? []), link.teamKey]);
  const common = (row: { id: string; name: string; stableId: string | null; statusKey: string | null; notionPageId: string | null }) => ({
    id: row.id,
    name: row.name,
    stableId: row.stableId,
    statusKey: row.statusKey,
    notionPageId: row.notionPageId,
  });
  return {
    nodes: [
      ...domains.map((row) => ({ ...common(row), level: "domain" as const, parentId: null, teams: [] })),
      ...fields.map((row) => ({ ...common(row), level: "field" as const, parentId: row.domainId, teams: [] })),
      ...items.map((row) => ({ ...common(row), level: "expertise" as const, parentId: row.fieldId, teams: teamsByItem.get(row.id) ?? [] })),
    ],
    statuses,
    teams: teamRows,
  };
}

/** Writes a plan. Must run inside the caller's transaction. */
export async function applyTaxonomyPlan(tx: Executor, plan: TaxonomyPlan): Promise<void> {
  const idByPage = new Map<string, string>();
  const now = new Date();

  for (const level of LEVELS) {
    const table = TABLE[level];
    const { rows } = plan.levels[level];
    for (const row of rows) if (row.dbId) idByPage.set(row.pageId, row.dbId);

    const parentId = (pageId: string | null) => {
      if (!pageId) return undefined;
      const id = idByPage.get(pageId);
      if (!id) throw new Error(`Internal error: the ${level} parent ${pageId} was not written.`);
      return id;
    };
    const parentColumn = (pageId: string | null) =>
      level === "field" ? { domainId: parentId(pageId)! } : level === "expertise" ? { fieldId: parentId(pageId)! } : {};

    // Stable IDs that move between rows: free them first so the unique index never sees two at once.
    const moving = rows.filter((row) => row.action === "update" && row.changes.includes("stableId")).map((row) => row.dbId!);
    if (moving.length > 0) await tx.update(table).set({ stableId: null }).where(inArray(table.id, moving));

    for (const row of rows.filter((candidate) => candidate.action === "update")) {
      await tx
        .update(table)
        .set({ name: row.name, stableId: row.stableId, statusKey: row.statusKey, notionPageId: row.pageId, ...parentColumn(row.parentPageId), updatedAt: now })
        .where(eq(table.id, row.dbId!));
    }

    const creates = rows.filter((row) => row.action === "create");
    for (let start = 0; start < creates.length; start += 500) {
      const chunk = creates.slice(start, start + 500);
      const inserted = await tx
        .insert(table)
        .values(
          chunk.map((row) => ({
            name: row.name,
            stableId: row.stableId,
            statusKey: row.statusKey,
            notionPageId: row.pageId,
            ...parentColumn(row.parentPageId),
          })) as never,
        )
        .returning({ id: table.id, notionPageId: table.notionPageId });
      for (const { id, notionPageId } of inserted) idByPage.set(notionPageId!, id);
    }

    if (level === "expertise") {
      const add = rows.flatMap((row) => row.teamsAdd.map((teamKey) => ({ expertiseId: idByPage.get(row.pageId)!, teamKey })));
      for (let start = 0; start < add.length; start += 1000) await tx.insert(expertiseTeams).values(add.slice(start, start + 1000));
      for (const row of rows.filter((candidate) => candidate.teamsRemove.length > 0)) {
        await tx.delete(expertiseTeams).where(and(eq(expertiseTeams.expertiseId, row.dbId!), inArray(expertiseTeams.teamKey, row.teamsRemove)));
      }
    }

    // Never deleted: only marked deprecated, and only when asked.
    const deprecate = plan.levels[level].missing.filter((row) => row.deprecate).map((row) => row.dbId);
    if (deprecate.length > 0) await tx.update(table).set({ statusKey: DEPRECATED, updatedAt: now }).where(inArray(table.id, deprecate));
  }
}

export interface TaxonomyImportOptions {
  apply: boolean;
  deprecateMissing?: boolean;
  triggeredBy: string;
  /** Test seam: runs inside the transaction just before it commits. */
  beforeCommit?: () => Promise<void>;
}

export interface TaxonomyImportResult {
  runId: string;
  mode: "dry_run" | "apply";
  plan: TaxonomyPlan;
  counts: PlanCounts;
}

/**
 * Plans the import against the current database and, with `apply`, writes
 * it in ONE transaction (all or nothing). Every run — dry, applied or
 * failed — is recorded in import_runs (see import-run.ts).
 */
export async function runTaxonomyImport(db: Database, source: TaxonomySource, options: TaxonomyImportOptions): Promise<TaxonomyImportResult> {
  const result = await runImport(db, {
    kind: "taxonomy",
    apply: options.apply,
    triggeredBy: options.triggeredBy,
    plan: async (executor) => planTaxonomyImport(source, await loadTaxonomySnapshot(executor), { deprecateMissing: options.deprecateMissing }),
    write: applyTaxonomyPlan,
    counts: (plan) => ({ ...countPlan(plan), deprecateMissing: plan.deprecateMissing }),
    issues: (plan) => plan.issues,
    beforeCommit: options.beforeCommit,
  });
  return { ...result, counts: countPlan(result.plan) };
}

const LABEL: Record<TaxonomyLevel, string> = { domain: "Domains", field: "Fields", expertise: "Expertise" };

/** The human report: per level counts, then every flagged / skipped / missing row with its reason. */
export function formatTaxonomyReport(result: Pick<TaxonomyImportResult, "mode" | "plan" | "counts" | "runId">): string {
  const { plan, counts } = result;
  const lines = [
    result.mode === "dry_run" ? "TAXONOMY IMPORT — DRY RUN (nothing written except the import_runs record)" : "TAXONOMY IMPORT — APPLIED (one transaction)",
    `run ${result.runId}${plan.deprecateMissing ? " · --deprecate-missing" : ""}`,
    "",
    "level       created  updated  unchanged  flagged  skipped  missing  deprecated",
  ];
  for (const level of LEVELS) {
    const c = counts[level];
    lines.push(
      `${LABEL[level].padEnd(10)} ${String(c.created).padStart(8)} ${String(c.updated).padStart(8)} ${String(c.unchanged).padStart(10)} ${String(c.flagged).padStart(8)} ${String(c.skipped).padStart(8)} ${String(c.missing).padStart(8)} ${String(c.deprecated).padStart(11)}`,
    );
  }
  lines.push(`team links: ${counts.teamLinks.added} added, ${counts.teamLinks.removed} removed`);
  const httpCleaned = LEVELS.map((level) => `${LABEL[level]} ${plan.levels[level].rows.filter((row) => row.httpRemoved).length}`).join(", ");
  lines.push(`Stable IDs with a leading "http://" removed: ${httpCleaned}`);

  const updates = LEVELS.flatMap((level) => plan.levels[level].rows.filter((row) => row.action === "update"));
  if (updates.length > 0) {
    const changed = new Map<string, number>();
    for (const row of updates) for (const change of row.changes) changed.set(change, (changed.get(change) ?? 0) + 1);
    lines.push(`updated fields: ${[...changed].map(([field, n]) => `${field} ${n}`).join(", ")}`);
  }

  const groups: [string, (issue: Issue) => boolean][] = [
    ["Skipped rows", (issue) => issue.kind === "skipped"],
    ["Flagged rows (imported)", (issue) => issue.kind === "flagged"],
    ["Values left out", (issue) => issue.kind === "value_skipped"],
    ["In the database but not in Notion", (issue) => issue.kind === "missing"],
  ];
  for (const [title, match] of groups) {
    const list = plan.issues.filter(match);
    lines.push("", `${title}: ${list.length}`);
    for (const issue of list) lines.push(`  [${issue.level}] ${issue.code} — ${issue.name}: ${issue.detail}`);
  }
  lines.push("", counts.changes === 0 ? "Result: 0 changes — the database already matches Notion." : `Result: ${counts.changes} changes.`);
  return lines.join("\n");
}
