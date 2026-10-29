"use client";

import Link from "next/link";
import type { CsvReport, CsvTable } from "../api/types";
import { useAdminData } from "../api/useAdminData";
import { AdminIcon } from "../ui/adminIcons";
import { focusRing, StatusMessage } from "../ui/controls";
import { formatPanelDate, RecordLayout } from "../ui/RecordForm";

const NOUN: Record<CsvTable, { title: string; href: string }> = {
  people: { title: "People", href: "/admin/people" },
  organizations: { title: "Organizations", href: "/admin/organizations" },
};

type Row = CsvReport["rows"][number];

function Section({ title, rows, empty, render }: { title: string; rows: Row[]; empty: string; render: (row: Row) => React.ReactNode }) {
  const id = `report-${title.toLowerCase().replace(/[^a-z]+/g, "-")}`;
  return (
    <section aria-labelledby={id} className="flex flex-col gap-1">
      <h2 id={id} className="font-bold">
        {title} ({rows.length})
      </h2>
      {rows.length === 0 ? (
        <p className="text-text-muted">{empty}</p>
      ) : (
        <ul className="flex flex-col">
          {rows.map((row) => (
            <li key={row.line} className="flex min-h-8 flex-wrap items-center gap-x-2 gap-y-0.5 border-b border-line px-1 py-1">
              <span className="w-16 shrink-0 text-meta text-text-muted">Row {row.line}</span>
              {render(row)}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * /admin/imports/csv/[id] — a CSV import's report (OPS-150): who imported
 * which file and when, the counts, the records added (linked), the
 * possible duplicates with the existing record each matched (linked), and
 * the rows left out with their errors. Reached from the import's toast,
 * Monitoring → History, and the Imports page.
 */
export function CsvReportScreen({ id }: { id: string }) {
  const report = useAdminData<CsvReport>(`/imports/csv/runs/${id}`);
  if (report.error || !report.data) {
    return (
      <RecordLayout backHref="/admin/history" backLabel="History" title="Import report">
        {report.error ? <StatusMessage tone="error">{report.error.status === 404 ? "This import report doesn’t exist." : report.error.message}</StatusMessage> : <StatusMessage>Loading the report…</StatusMessage>}
      </RecordLayout>
    );
  }
  const data = report.data;
  const noun = NOUN[data.table];
  const link = (recordId: string, name: string) => (
    <Link href={`${noun.href}/${recordId}`} className={`font-bold underline underline-offset-2 ${focusRing}`}>
      {name}
    </Link>
  );
  const of = (status: Row["status"]) => data.rows.filter((row) => row.status === status);
  return (
    <RecordLayout backHref={noun.href} backLabel={noun.title} title={`Import report · ${data.counts.fileName ?? "CSV"}`}>
      <dl className="grid max-w-[720px] grid-cols-[168px_minmax(0,1fr)] gap-y-1 text-body">
        <dt className="text-text-muted">Imported into</dt>
        <dd>{noun.title}</dd>
        <dt className="text-text-muted">File</dt>
        <dd>{data.counts.fileName}</dd>
        <dt className="text-text-muted">By</dt>
        <dd>{data.triggeredBy}</dd>
        <dt className="text-text-muted">When</dt>
        <dd>{formatPanelDate(data.startedAt)}</dd>
        <dt className="text-text-muted">Result</dt>
        <dd>
          {data.mode === "apply"
            ? `${data.counts.create ?? 0} added · ${data.counts.duplicates ?? 0} not added (already existing) · ${data.counts.errors ?? 0} with errors`
            : "Nothing was imported."}
        </dd>
      </dl>
      {data.failure ? (
        <p role="alert" className="flex items-center gap-1">
          <AdminIcon name="warning" />
          {data.failure}
        </p>
      ) : null}
      <Section title="Added" rows={of("created")} empty="No record was added." render={(row) => (row.recordId ? link(row.recordId, row.name) : row.name)} />
      <Section
        title="Possible duplicates, not added"
        rows={of("duplicate")}
        empty="None."
        render={(row) => (
          <>
            <span className="font-bold">{row.name}</span>
            <span className="text-text-muted">
              {row.duplicate?.existing ? (
                <>
                  {row.duplicate.reason.slice(0, row.duplicate.reason.lastIndexOf(row.duplicate.existing.name))}
                  {link(row.duplicate.existing.id, row.duplicate.existing.name)}
                </>
              ) : (
                row.duplicate?.reason
              )}
            </span>
          </>
        )}
      />
      <Section
        title="Rows with errors, not added"
        rows={of("error")}
        empty="None."
        render={(row) => (
          <>
            <span className="font-bold">{row.name || "(no name)"}</span>
            {row.errors.map((error) => (
              <span key={error} className="flex w-full items-center gap-1 pl-[72px] text-meta">
                <AdminIcon name="warning" />
                {error}
              </span>
            ))}
          </>
        )}
      />
      {of("not_imported").length > 0 ? <Section title="Not imported (the import stopped)" rows={of("not_imported")} empty="" render={(row) => row.name} /> : null}
    </RecordLayout>
  );
}
