import type { Database } from "../common/database/database.module.js";
import { recordAuditEvent } from "../audit/audit.service.js";
import { AUTOMATION } from "../audit/audit.types.js";
import { importRuns } from "./import.schema.js";

type Executor = Pick<Database, "select" | "insert" | "update" | "delete">;

/**
 * The shared shape of a Notion import run (taxonomy, directory): plan
 * against the database, then either stop (dry run) or apply — planned and
 * written inside ONE transaction, so it writes exactly what it reports, all
 * or nothing. Every run (dry, applied, failed) leaves an import_runs row.
 */
export interface ImportRunSpec<Plan> {
  kind: string;
  apply: boolean;
  triggeredBy: string;
  plan: (db: Executor) => Promise<Plan>;
  write: (tx: Executor, plan: Plan) => Promise<void>;
  counts: (plan: Plan) => object;
  issues: (plan: Plan) => unknown[];
  /** Checked before writing: a reason not to apply this plan at all. */
  refuseApply?: (plan: Plan) => string | undefined;
  /** Test seam: runs inside the transaction just before it commits. */
  beforeCommit?: () => Promise<void>;
}

export interface ImportRunResult<Plan> {
  runId: string;
  mode: "dry_run" | "apply";
  plan: Plan;
}

/**
 * Refusal for an apply that must match a reviewed dry run: the fresh plan's
 * counts must equal the dry run's, or something changed in between (in
 * Notion or the database) and the dry run no longer describes the write.
 */
export function countsChangedRefusal(expected: unknown, actual: unknown): string | undefined {
  if (expected === undefined) return undefined;
  return canonicalJson(expected) === canonicalJson(actual)
    ? undefined
    : "Notion or the database changed since the dry run: run a new dry run and review it before applying.";
}

/** JSON with object keys sorted — jsonb doesn't keep key order, so stored counts compare by content. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, inner: unknown) =>
    inner && typeof inner === "object" && !Array.isArray(inner)
      ? Object.fromEntries(Object.entries(inner as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : inner,
  );
}

export class ImportRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportRefusedError";
  }
}

export async function runImport<Plan>(db: Database, spec: ImportRunSpec<Plan>): Promise<ImportRunResult<Plan>> {
  const startedAt = new Date();
  const record = async (executor: Executor, mode: "dry_run" | "apply" | "failed", counts: object, issues: unknown[]) => {
    const [run] = await executor
      .insert(importRuns)
      .values({ kind: spec.kind, mode, startedAt, finishedAt: new Date(), counts, issues, triggeredBy: spec.triggeredBy })
      .returning({ id: importRuns.id });
    // Every run is logged (imports are writes, even a dry run's record).
    await recordAuditEvent(executor, {
      entityType: "import_run",
      entityId: run!.id,
      action: "created",
      actor: AUTOMATION,
      source: "import",
      meta: { label: `${spec.kind} import · ${mode.replace("_", " ")}`, triggeredBy: spec.triggeredBy },
    });
    return run!.id;
  };

  if (!spec.apply) {
    const plan = await spec.plan(db);
    return { runId: await record(db, "dry_run", spec.counts(plan), spec.issues(plan)), mode: "dry_run", plan };
  }

  let planned: Plan | undefined;
  try {
    return await db.transaction(async (tx) => {
      const plan = await spec.plan(tx);
      planned = plan;
      const refusal = spec.refuseApply?.(plan);
      if (refusal) throw new ImportRefusedError(refusal);
      await spec.write(tx, plan);
      const runId = await record(tx, "apply", spec.counts(plan), spec.issues(plan));
      await spec.beforeCommit?.();
      return { runId, mode: "apply" as const, plan };
    });
  } catch (error) {
    // Rolled back: nothing was written. Record the failure (or refusal) on its own.
    const message = error instanceof Error ? error.message : String(error);
    const refused = error instanceof ImportRefusedError;
    await record(db, "failed", planned ? spec.counts(planned) : {}, [
      { kind: "error", code: refused ? "apply_refused" : "run_failed", detail: refused ? `Refused, nothing written: ${message}` : `Rolled back, nothing written: ${message}` },
      ...(planned ? spec.issues(planned) : []),
    ]);
    throw error;
  }
}
