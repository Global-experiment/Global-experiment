import type { ImportJob, ImportKind, ImportRun } from "../api/types";

export const KIND_LABEL: Record<ImportKind, string> = { directory: "People & organizations" };

/** Every kind of past run, including the retired imports' and the CSV imports'. */
const RUN_KIND_LABEL: Record<string, string> = {
  ...KIND_LABEL,
  people_csv: "People (CSV)",
  organizations_csv: "Organizations (CSV)",
  taxonomy: "Taxonomy (retired)",
  treasury: "Treasury expenses (retired)",
};

const PHASE: Record<ImportJob["phase"], string> = {
  queued: "Starting…",
  reading_notion: "Reading Notion…",
  planning: "Comparing with the database…",
  applying: "Writing to the database (one transaction)…",
  done: "Done",
};

/** One line for a job in progress or finished. */
export function jobLine(job: ImportJob): string {
  const what = `${KIND_LABEL[job.kind]} ${job.mode === "apply" ? "apply" : "dry run"}`;
  if (job.status === "running") return `${what}: ${PHASE[job.phase]}`;
  if (job.status === "succeeded") return `${what} finished: ${job.changes === 0 ? "no changes" : `${job.changes} change${job.changes === 1 ? "" : "s"}`}.`;
  if (job.status === "refused") return `${what} refused: ${job.error}`;
  return `${what} failed: ${job.error}`;
}

/** Apply is offered only for the dry run just shown, when the API says it can be applied. */
export const canApply = (job: ImportJob | null): job is ImportJob & { runId: string } =>
  job !== null && job.mode === "dry_run" && job.status === "succeeded" && job.applicable && job.runId !== null;

export const MODE_LABEL: Record<ImportRun["mode"], string> = { dry_run: "Dry run", apply: "Applied", failed: "Failed / refused" };

export const runKindLabel = (kind: string) => RUN_KIND_LABEL[kind] ?? kind;

/** "12 changes" / "—" for a run's counts. */
export const runChanges = (run: ImportRun) =>
  typeof run.counts.changes === "number" ? String(run.counts.changes) : typeof run.counts.create === "number" ? `${run.counts.create} created` : "—";

const dateTime = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
export const formatWhen = (iso: string) => dateTime.format(new Date(iso));
