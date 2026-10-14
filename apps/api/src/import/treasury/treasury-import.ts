import { eq, isNotNull, sql } from "drizzle-orm";
import type { Database } from "../../common/database/database.module.js";
import { organizations } from "../../organizations/organizations.schema.js";
import { people } from "../../people/people.schema.js";
import { treasuryEntries, treasuryEntryExpenseTypes, treasuryExpenseTypes, treasuryReviewStatuses } from "../../treasury/treasury.schema.js";
import { countsChangedRefusal, runImport } from "../import-run.js";
import {
  countTreasuryPlan,
  planTreasuryImport,
  treasuryOnlyDemoRefusal,
  type DbTreasuryEntry,
  type TreasuryCounts,
  type TreasuryIssue,
  type TreasuryPlan,
  type TreasurySnapshot,
} from "./treasury-plan.js";
import type { TreasurySource } from "./treasury-source.js";

type Executor = Pick<Database, "select" | "insert" | "update" | "delete" | "execute">;

const iso = (value: Date | null) => (value ? value.toISOString() : null);

export async function loadTreasurySnapshot(db: Executor, options: { publishUnqualified: boolean; now?: Date }): Promise<TreasurySnapshot> {
  const [rows, links, types, statuses, peopleRows, organizationRows] = await Promise.all([
    db
      .select({
        id: treasuryEntries.id,
        notionPageId: treasuryEntries.notionPageId,
        managedBy: treasuryEntries.managedBy,
        entryNumber: treasuryEntries.entryNumber,
        entryType: treasuryEntries.entryType,
        name: treasuryEntries.name,
        currency: treasuryEntries.currency,
        grossAmount: treasuryEntries.grossAmount,
        feeAmount: treasuryEntries.feeAmount,
        netAmount: treasuryEntries.netAmount,
        cadence: treasuryEntries.cadence,
        source: treasuryEntries.source,
        externalTransactionId: treasuryEntries.externalTransactionId,
        sourceAccountId: treasuryEntries.sourceAccountId,
        occurredOn: treasuryEntries.occurredOn,
        occurredAt: treasuryEntries.occurredAt,
        recipientPersonId: treasuryEntries.recipientPersonId,
        recipientOrganizationId: treasuryEntries.recipientOrganizationId,
        reviewStatusKey: treasuryEntries.reviewStatusKey,
        reviewedAt: treasuryEntries.reviewedAt,
        publicationStatus: treasuryEntries.publicationStatus,
        publishedAt: treasuryEntries.publishedAt,
        publicDescription: treasuryEntries.publicDescription,
        internalNote: treasuryEntries.internalNote,
        importedAt: treasuryEntries.importedAt,
      })
      .from(treasuryEntries),
    db.select({ entryId: treasuryEntryExpenseTypes.entryId, typeKey: treasuryEntryExpenseTypes.typeKey }).from(treasuryEntryExpenseTypes),
    db.select({ key: treasuryExpenseTypes.key, label: treasuryExpenseTypes.label }).from(treasuryExpenseTypes),
    db.select({ key: treasuryReviewStatuses.key, label: treasuryReviewStatuses.label }).from(treasuryReviewStatuses),
    db.select({ id: people.id, notionPageId: people.notionPageId }).from(people).where(isNotNull(people.notionPageId)),
    db.select({ id: organizations.id, notionPageId: organizations.notionPageId }).from(organizations).where(isNotNull(organizations.notionPageId)),
  ]);
  const typesByEntry = new Map<string, string[]>();
  for (const link of links) typesByEntry.set(link.entryId, [...(typesByEntry.get(link.entryId) ?? []), link.typeKey]);
  const entries: DbTreasuryEntry[] = rows.map((row) => ({
    ...row,
    occurredAt: iso(row.occurredAt),
    reviewedAt: iso(row.reviewedAt),
    publishedAt: iso(row.publishedAt),
    importedAt: iso(row.importedAt),
    expenseTypeKeys: typesByEntry.get(row.id) ?? [],
  }));
  return {
    entries,
    expenseTypes: types,
    reviewStatuses: statuses,
    peopleByPage: new Map(peopleRows.map((row) => [row.notionPageId!, row.id])),
    organizationsByPage: new Map(organizationRows.map((row) => [row.notionPageId!, row.id])),
    publishUnqualified: options.publishUnqualified,
    now: options.now ?? new Date(),
  };
}

/** A number no real entry uses, to park numbers that move between rows within the transaction. */
const PARKED = 2_000_000_000;

/** Writes a Treasury plan. Must run inside the caller's transaction. */
export async function applyTreasuryPlan(tx: Executor, plan: TreasuryPlan): Promise<void> {
  const now = new Date();
  const columns = (values: TreasuryPlan["entries"][number]["values"]) => ({
    notionPageId: values.notionPageId,
    managedBy: "notion" as const,
    entryType: "expense" as const,
    name: values.name,
    currency: values.currency,
    grossAmount: values.grossAmount,
    feeAmount: values.feeAmount,
    netAmount: values.netAmount,
    cadence: values.cadence,
    source: values.source,
    livemode: true,
    externalTransactionId: values.externalTransactionId,
    sourceAccountId: values.sourceAccountId,
    occurredOn: values.occurredOn,
    occurredAt: values.occurredAt ? new Date(values.occurredAt) : null,
    recipientPersonId: values.recipientPersonId,
    recipientOrganizationId: values.recipientOrganizationId,
    reviewStatusKey: values.reviewStatusKey,
    reviewedAt: values.reviewedAt ? new Date(values.reviewedAt) : null,
    publicationStatus: values.publicationStatus,
    publishedAt: values.publishedAt ? new Date(values.publishedAt) : null,
    publicDescription: values.publicDescription,
    internalNote: values.internalNote,
  });

  const ids = new Map<string, string>();
  const moving = plan.entries.filter((entry) => entry.action === "update" && entry.number !== null);
  for (const [index, entry] of moving.entries()) {
    await tx.update(treasuryEntries).set({ entryNumber: PARKED + index }).where(eq(treasuryEntries.id, entry.dbId!));
  }
  for (const entry of plan.entries.filter((candidate) => candidate.action === "update")) {
    ids.set(entry.pageId, entry.dbId!);
    await tx
      .update(treasuryEntries)
      .set({ ...columns(entry.values), ...(entry.number !== null ? { entryNumber: entry.number } : {}), updatedAt: now })
      .where(eq(treasuryEntries.id, entry.dbId!));
  }

  // Creates with Notion's EXP-n first, then move the identity past every number in use.
  const creates = plan.entries.filter((entry) => entry.action === "create");
  const insert = async (batch: typeof creates, withNumber: boolean) => {
    for (let start = 0; start < batch.length; start += 200) {
      const inserted = await tx
        .insert(treasuryEntries)
        .values(
          batch.slice(start, start + 200).map((entry) => ({
            ...columns(entry.values),
            importedAt: new Date(entry.values.importedAt),
            ...(withNumber ? { entryNumber: entry.number! } : {}),
          })),
        )
        .returning({ id: treasuryEntries.id, notionPageId: treasuryEntries.notionPageId });
      for (const row of inserted) ids.set(row.notionPageId!, row.id);
    }
  };
  const numbered = creates.filter((entry) => entry.number !== null);
  await insert(numbered, true);
  if (numbered.length > 0 || moving.length > 0) {
    await tx.execute(
      sql.raw(
        `select setval(pg_get_serial_sequence('"treasury_entries"', 'entry_number'), greatest((select max("entry_number") from "treasury_entries"), nextval(pg_get_serial_sequence('"treasury_entries"', 'entry_number')) - 1), true)`,
      ),
    );
  }
  await insert(
    creates.filter((entry) => entry.number === null),
    false,
  );

  // Expense types are synced fields: exactly Notion's.
  for (const entry of plan.entries.filter((candidate) => candidate.action !== "unchanged")) {
    const id = ids.get(entry.pageId)!;
    await tx.delete(treasuryEntryExpenseTypes).where(eq(treasuryEntryExpenseTypes.entryId, id));
    if (entry.values.expenseTypeKeys.length > 0) {
      await tx.insert(treasuryEntryExpenseTypes).values(entry.values.expenseTypeKeys.map((typeKey) => ({ entryId: id, typeKey })));
    }
  }
}

export interface TreasuryImportOptions {
  apply: boolean;
  triggeredBy: string;
  publishUnqualified: boolean;
  beforeCommit?: () => Promise<void>;
  /** Apply only if the plan's counts equal these (a reviewed dry run's). */
  expectCounts?: unknown;
}

export interface TreasuryImportResult {
  runId: string;
  mode: "dry_run" | "apply";
  plan: TreasuryPlan;
  counts: TreasuryCounts;
}

export async function runTreasuryImport(db: Database, source: TreasurySource, options: TreasuryImportOptions): Promise<TreasuryImportResult> {
  const result = await runImport(db, {
    kind: "treasury",
    apply: options.apply,
    triggeredBy: options.triggeredBy,
    plan: async (executor) => planTreasuryImport(source, await loadTreasurySnapshot(executor as Executor, { publishUnqualified: options.publishUnqualified })),
    write: (tx, plan) => applyTreasuryPlan(tx as Executor, plan),
    counts: countTreasuryPlan,
    issues: (plan) => plan.issues,
    refuseApply: (plan) => treasuryOnlyDemoRefusal(plan) ?? countsChangedRefusal(options.expectCounts, countTreasuryPlan(plan)),
    beforeCommit: options.beforeCommit,
  });
  return { ...result, counts: countTreasuryPlan(result.plan) };
}

const pad = (value: number | string, width: number) => String(value).padStart(width);

export function formatTreasuryReport(result: Pick<TreasuryImportResult, "mode" | "plan" | "counts" | "runId">): string {
  const { plan, counts } = result;
  const lines = [
    result.mode === "dry_run" ? "TREASURY IMPORT — DRY RUN (nothing written except the import_runs record)" : "TREASURY IMPORT — APPLIED (one transaction)",
    `run ${result.runId}`,
    `Notion: ${plan.totals.notion} rows — ${plan.totals.expenses} expenses, ${plan.totals.donations} donations (donations are native, from Stripe: never imported); ${plan.totals.demo} of them demo`,
    "",
    "expenses  created  updated  unchanged  flagged  skipped  (demo)  missing",
    `${"".padEnd(8)} ${pad(counts.created, 8)} ${pad(counts.updated, 8)} ${pad(counts.unchanged, 10)} ${pad(counts.flagged, 8)} ${pad(counts.skipped, 8)} ${pad(`(${counts.demo})`, 7)} ${pad(counts.missing, 8)}`,
  ];
  if (plan.ignored.unreadProperties.length > 0) lines.push("", `Notion properties not stored: ${plan.ignored.unreadProperties.join(", ")}`);
  const updates = plan.entries.filter((entry) => entry.action === "update");
  if (updates.length > 0) {
    const changed = new Map<string, number>();
    for (const entry of updates) for (const field of entry.changes) changed.set(field, (changed.get(field) ?? 0) + 1);
    lines.push(`updated fields: ${[...changed].map(([field, n]) => `${field} ${n}`).join(", ")}`);
  }
  const groups: [string, (issue: TreasuryIssue) => boolean][] = [
    ["Skipped rows", (issue) => issue.kind === "skipped"],
    ["Flagged rows (imported)", (issue) => issue.kind === "flagged"],
    ["Values left empty or adjusted", (issue) => issue.kind === "value_skipped"],
    ["In the database but not in Notion", (issue) => issue.kind === "missing"],
  ];
  for (const [title, match] of groups) {
    const list = plan.issues.filter(match);
    lines.push("", `${title}: ${list.length}`);
    for (const issue of list) lines.push(`  ${issue.code} — ${issue.name}: ${issue.detail}`);
  }
  const refusal = treasuryOnlyDemoRefusal(plan);
  if (refusal) lines.push("", refusal);
  lines.push("", counts.changes === 0 ? "Result: 0 changes — the database already matches Notion." : `Result: ${counts.changes} changes.`);
  return lines.join("\n");
}

