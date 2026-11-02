import type { ImportRun } from "../api/types";

/** Every kind of run: the CSV imports, and the Notion imports from before OPS-154 (removed 2026-11-03). */
const RUN_KIND_LABEL: Record<string, string> = {
  people_csv: "People (CSV)",
  organizations_csv: "Organizations (CSV)",
  directory: "People & organizations (Notion, removed)",
  taxonomy: "Taxonomy (Notion, removed)",
  treasury: "Treasury expenses (Notion, removed)",
};

export const MODE_LABEL: Record<ImportRun["mode"], string> = { dry_run: "Dry run", apply: "Applied", failed: "Failed / refused" };

export const runKindLabel = (kind: string) => RUN_KIND_LABEL[kind] ?? kind;

/** "12 changes" / "3 created" / "—" for a run's counts. */
export const runChanges = (run: ImportRun) =>
  typeof run.counts.changes === "number" ? String(run.counts.changes) : typeof run.counts.create === "number" ? `${run.counts.create} created` : "—";

const dateTime = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
export const formatWhen = (iso: string) => dateTime.format(new Date(iso));
