"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import type { ImportRun, Page } from "../api/types";
import { useAdminData } from "../api/useAdminData";
import { focusRing, StatusMessage } from "../ui/controls";
import { formatWhen, MODE_LABEL, runChanges, runKindLabel } from "./importDisplay";

/**
 * /admin/imports — the history of imports (imports.read). CSV is the only
 * import (OPS-154, client 2026-11-03): People or Organizations → More
 * options → Import CSV. Each CSV run opens its report; the Notion runs from
 * before stay listed, with their issues, read-only.
 */
export function ImportsScreen() {
  const runs = useAdminData<Page<ImportRun>>("/imports/runs?pageSize=20");
  const [openRun, setOpenRun] = useState<string | null>(null);

  return (
    <main className="flex flex-col gap-3 pb-6 text-body">
      <header className="sticky top-0 z-10 flex h-10 items-center bg-surface-base px-2">
        <h1 className="text-body font-bold">Imports</h1>
      </header>
      <p className="max-w-[720px] px-2 text-text-muted">
        People and Organizations are imported from a CSV file: More options → Import CSV on their list. Every import is listed here, with its report.
      </p>

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
                      {run.kind.endsWith("_csv") ? (
                        <Link href={`/admin/imports/csv/${run.id}`} className={`underline underline-offset-2 ${focusRing}`}>
                          Report
                        </Link>
                      ) : run.issues.length === 0 ? (
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
