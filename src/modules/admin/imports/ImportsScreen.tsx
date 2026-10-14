"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { adminApi, AdminApiError } from "../api/client";
import type { ImportJob, ImportKind, ImportRun, ImportStatus, Page } from "../api/types";
import { useAdminData } from "../api/useAdminData";
import { AdminButton, focusRing, StatusMessage } from "../ui/controls";
import { useToast } from "../ui/Toast";
import { canApply, formatWhen, jobLine, KIND_LABEL, MODE_LABEL, runChanges, runKindLabel } from "./importDisplay";

const POLL_MS = 1000;
const KINDS: ImportKind[] = ["taxonomy", "directory"];

/**
 * /admin/imports — the "Notion import" page. Dry runs and applies run as
 * background jobs in the API (the request returns at once; this page polls
 * the job). Apply is offered only for the dry run just reviewed, behind a
 * confirmation, and the API refuses it if anything changed since. The
 * Notion token never leaves the server: the page only sees reports.
 */
export function ImportsScreen() {
  const toast = useToast();
  const status = useAdminData<ImportStatus>("/imports/status");
  const runs = useAdminData<Page<ImportRun>>("/imports/runs?pageSize=20");
  const [job, setJob] = useState<ImportJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [openRun, setOpenRun] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  // Pick up a job that was already running (e.g. after a reload).
  const active = status.data?.activeJob ?? null;
  const shown = job ?? active;
  const running = shown?.status === "running";

  const jobId = running ? shown.id : null;
  const { reload: reloadRuns } = runs;
  const { reload: reloadStatus } = status;
  useEffect(() => {
    if (!jobId) return;
    const timer = setInterval(() => {
      adminApi<ImportJob>(`/imports/jobs/${jobId}`).then(
        (next) => {
          setJob(next);
          if (next.status !== "running") {
            reloadRuns();
            reloadStatus();
            // Figma's confirmation toast — only for a successful apply (a dry run writes nothing).
            if (next.mode === "apply" && next.status === "succeeded") toast("Notion imported");
          }
        },
        () => undefined, // a missed poll is retried on the next tick
      );
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [jobId, reloadRuns, reloadStatus, toast]);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (confirming && !element.open) element.showModal();
    if (!confirming && element.open) element.close();
  }, [confirming]);

  async function start(path: string, body?: object) {
    setError(null);
    try {
      setJob(await adminApi<ImportJob>(path, { method: "POST", body }));
    } catch (caught) {
      setError(caught instanceof AdminApiError ? (caught.issues[0]?.message ?? caught.message) : "Couldn't start the import.");
    }
  }

  async function apply() {
    if (!canApply(shown)) return;
    setConfirming(false);
    await start(`/imports/${shown.kind}/apply`, { dryRunId: shown.runId });
    toast("Import started");
  }

  return (
    <main className="flex flex-col gap-3 pb-6 text-body">
      <header className="flex h-10 items-center px-2">
        <h1 className="text-body font-bold">Notion import</h1>
      </header>
      <p className="max-w-[720px] px-2 text-text-muted">
        Copies the Notion &ldquo;0.1 native&rdquo; databases into the admin. Always start with a dry run: it reads Notion and reports what
        would change without writing anything. Apply writes exactly that, in one transaction — never deleting a record.
      </p>

      <section aria-label="Run an import" className="flex flex-wrap gap-2 px-2">
        {KINDS.map((kind) => {
          const availability = status.data?.[kind];
          return (
            <div key={kind} className="flex w-[340px] flex-col gap-2 rounded-control border border-line p-2">
              <h2 className="font-bold">{KIND_LABEL[kind]}</h2>
              {availability && !availability.available ? <p className="text-meta text-text-muted">{availability.reason}</p> : null}
              <AdminButton
                icon="sync"
                disabled={!availability?.available || running}
                onClick={() => void start(`/imports/${kind}/dry-run`)}
                className="self-start"
              >
                Dry run {KIND_LABEL[kind].toLowerCase()}
              </AdminButton>
            </div>
          );
        })}
      </section>

      {error ? (
        <div className="px-2">
          <StatusMessage tone="error">{error}</StatusMessage>
        </div>
      ) : null}

      {shown ? (
        <section aria-label="Import job" className="flex flex-col gap-2 px-2">
          <p role="status" aria-live="polite" data-job-status={shown.status} className="font-bold">
            {jobLine(shown)}
          </p>
          {shown.report ? (
            <pre aria-label="Import report" className="max-h-[480px] max-w-full overflow-auto rounded-control border border-line p-2 text-meta whitespace-pre-wrap">
              {shown.report}
            </pre>
          ) : null}
          {canApply(shown) ? (
            <AdminButton icon="check_circle" onClick={() => setConfirming(true)} className="self-start">
              Apply this dry run…
            </AdminButton>
          ) : null}
        </section>
      ) : null}

      <dialog
        ref={dialog}
        aria-labelledby="confirm-import-title"
        onClose={() => setConfirming(false)}
        className="m-auto w-[420px] rounded-control border border-line bg-surface-base p-3 text-text-primary backdrop:bg-black/60"
      >
        {canApply(shown) ? (
          <>
            <h2 id="confirm-import-title" className="font-bold">
              Apply the {KIND_LABEL[shown.kind].toLowerCase()} dry run?
            </h2>
            <p className="mt-2">
              This writes {shown.changes} change{shown.changes === 1 ? "" : "s"} to the database in one transaction, exactly as the report shows.
              If Notion or the database changed since the dry run, nothing is written and you&rsquo;ll be asked for a new dry run.
            </p>
            <div className="mt-3 flex justify-end gap-2">
              <AdminButton onClick={() => setConfirming(false)}>Cancel</AdminButton>
              <AdminButton icon="check_circle" onClick={() => void apply()}>
                Apply
              </AdminButton>
            </div>
          </>
        ) : null}
      </dialog>

      <section aria-label="Import history" className="px-2">
        <h2 className="mb-1 font-bold">History</h2>
        {runs.error ? (
          <StatusMessage tone="error">{runs.error.message}</StatusMessage>
        ) : !runs.data ? (
          <StatusMessage>Loading history…</StatusMessage>
        ) : runs.data.items.length === 0 ? (
          <StatusMessage>No imports yet.</StatusMessage>
        ) : (
          <table className="w-full table-fixed border-separate border-spacing-0">
            <caption className="sr-only">Import history</caption>
            <thead>
              <tr className="text-left text-text-muted">
                {["When", "Kind", "Mode", "Changes", "Issues", "By"].map((label) => (
                  <th key={label} scope="col" className="h-[33px] px-1 pb-[3px] align-bottom font-normal">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {runs.data.items.map((run) => (
                <Fragment key={run.id}>
                  <tr>
                    <td className="border-t border-line px-1 py-1">{formatWhen(run.startedAt)}</td>
                    <td className="border-t border-l border-line px-1 py-1">{runKindLabel(run.kind)}</td>
                    <td className="border-t border-l border-line px-1 py-1">{MODE_LABEL[run.mode]}</td>
                    <td className="border-t border-l border-line px-1 py-1 tabular-nums">{runChanges(run)}</td>
                    <td className="border-t border-l border-line px-1 py-1">
                      {run.issues.length === 0 ? (
                        "0"
                      ) : (
                        <button
                          type="button"
                          aria-expanded={openRun === run.id}
                          onClick={() => setOpenRun(openRun === run.id ? null : run.id)}
                          className={`cursor-pointer underline underline-offset-2 ${focusRing}`}
                        >
                          {run.issues.length} {openRun === run.id ? "(hide)" : "(show)"}
                        </button>
                      )}
                    </td>
                    <td className="truncate border-t border-l border-line px-1 py-1" title={run.triggeredBy}>
                      {run.triggeredBy}
                    </td>
                  </tr>
                  {openRun === run.id ? (
                    <tr>
                      <td colSpan={6} className="border-t border-line px-1 py-1">
                        <ul className="max-h-60 overflow-y-auto text-meta">
                          {run.issues.map((issue, index) => (
                            <li key={index}>
                              {issue.code}
                              {issue.name ? ` — ${issue.name}` : ""}: {issue.detail}
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
