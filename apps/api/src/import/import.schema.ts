import { sql } from "drizzle-orm";
import { check, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * One row per import run from Notion — dry runs included, failed runs too —
 * so what the importer did (or would have done) stays auditable.
 * `counts` and `issues` are the run's report (see import/taxonomy).
 */
export const importRuns = pgTable(
  "import_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** What was imported: "taxonomy" today; People/Organizations later. */
    kind: text("kind").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    /** "dry_run" (nothing written but this row), "apply", or "failed" (rolled back). */
    mode: text("mode").notNull(),
    counts: jsonb("counts").notNull().default(sql`'{}'::jsonb`),
    issues: jsonb("issues").notNull().default(sql`'[]'::jsonb`),
    /** Who started it, e.g. "cli:<os user>". */
    triggeredBy: text("triggered_by").notNull(),
  },
  (table) => [
    index("import_runs_kind_started_at_idx").on(table.kind, table.startedAt),
    check("import_runs_kind_shape", sql`${table.kind} ~ '^[a-z][a-z_]{0,39}$'`),
    check("import_runs_mode_known", sql`${table.mode} in ('dry_run', 'apply', 'failed')`),
    check("import_runs_finished_after_start", sql`${table.finishedAt} is null or ${table.finishedAt} >= ${table.startedAt}`),
    check("import_runs_triggered_by_present", sql`length(btrim(${table.triggeredBy})) between 1 and 200`),
  ],
);
