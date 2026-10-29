"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { adminApi, AdminApiError } from "../api/client";
import type { CsvCounts, CsvPreview, CsvPreviewRow, CsvTable } from "../api/types";
import { useCan } from "../session";
import { AdminIcon } from "../ui/adminIcons";
import { AdminButton, AdminButtonLink, focusRing, StatusMessage } from "../ui/controls";
import { PanelButton, recordInput, RecordLayout } from "../ui/RecordForm";
import { useToast } from "../ui/Toast";

const MAX_BYTES = 2 * 1024 * 1024;
const NOUN: Record<CsvTable, { many: string; one: string; title: string; href: string }> = {
  people: { many: "people", one: "person", title: "People", href: "/admin/people" },
  organizations: { many: "organizations", one: "organization", title: "Organizations", href: "/admin/organizations" },
};
const STEPS = ["Upload", "Columns", "Check", "Done"] as const;
type Step = (typeof STEPS)[number];

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** The API's sentence for a refusal (a file it can't read, column choices that can't work, a changed database). */
const reason = (caught: unknown) => (caught instanceof AdminApiError ? (caught.issues[0]?.message ?? caught.message) : "Something went wrong. Please try again.");

async function send(table: CsvTable, step: "preview" | "confirm", file: File, options: object) {
  const form = new FormData();
  form.append("options", JSON.stringify({ fileName: file.name, ...options }));
  form.append("file", file);
  return adminApi<unknown>(`/imports/csv/${table}/${step}`, { method: "POST", body: form });
}

/**
 * The error modal (OPS-150): what went wrong with the file or the import,
 * in one sentence, and what to do next.
 */
function ErrorDialog({ title, message, action, onClose }: { title: string; message: string; action: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog ref={dialog} aria-labelledby={titleId} onClose={onClose} className="m-auto w-[440px] max-w-[calc(100vw-32px)] rounded-control border border-line bg-surface-base p-3 text-body text-text-primary backdrop:bg-black/60">
      <h2 id={titleId} className="flex items-center gap-1 font-bold">
        <AdminIcon name="warning" />
        {title}
      </h2>
      <p role="alert" className="mt-2">
        {message}
      </p>
      <p className="mt-3 flex justify-end">
        <AdminButton onClick={() => dialog.current?.close()}>{action}</AdminButton>
      </p>
    </dialog>
  );
}

function Stepper({ current }: { current: Step }) {
  const at = STEPS.indexOf(current);
  return (
    <ol aria-label="Import steps" className="flex items-center gap-4 text-body">
      {STEPS.map((step, index) => (
        <li key={step} aria-current={index === at ? "step" : undefined} className={`flex items-center gap-1 ${index === at ? "font-bold text-text-primary" : index < at ? "text-text-primary" : "text-text-muted"}`}>
          <span aria-hidden="true" className={`flex size-5 items-center justify-center rounded-full text-meta ring-1 ${index <= at ? "ring-text-primary" : "ring-line"}`}>
            {index < at ? <AdminIcon name="check_circle" /> : index + 1}
          </span>
          {step}
        </li>
      ))}
    </ol>
  );
}

function CountsLine({ counts, noun }: { counts: CsvCounts; noun: (typeof NOUN)[CsvTable] }) {
  return (
    <ul data-counts className="flex flex-wrap gap-2">
      <li className="rounded-control px-2 py-1 ring-1 ring-line">
        <span className="font-bold tabular-nums">{counts.create}</span> to add
      </li>
      <li className="rounded-control px-2 py-1 ring-1 ring-line">
        <span className="font-bold tabular-nums">{counts.duplicates}</span> possible {counts.duplicates === 1 ? "duplicate" : "duplicates"} skipped
      </li>
      <li className="rounded-control px-2 py-1 ring-1 ring-line">
        <span className="font-bold tabular-nums">{counts.errors}</span> with {counts.errors === 1 ? "an error" : "errors"}
      </li>
      <li className="px-2 py-1 text-text-muted">
        {plural(counts.rows, "row", "rows")} in {counts.fileName}
        {counts.duplicatesIncluded > 0 ? ` · ${counts.duplicatesIncluded} possible ${counts.duplicatesIncluded === 1 ? "duplicate" : "duplicates"} included` : ""} · {noun.many}
      </li>
    </ul>
  );
}

const recordHref = (table: CsvTable, id: string) => `${NOUN[table].href}/${id}`;

function DuplicateLine({ table, row }: { table: CsvTable; row: CsvPreviewRow }) {
  if (!row.duplicate) return null;
  const { existing, reason: why } = row.duplicate;
  if (!existing) return <span className="text-text-muted">{why}</span>;
  const name = existing.name;
  const at = why.lastIndexOf(name);
  return (
    <span className="text-text-muted">
      {at > 0 ? why.slice(0, at) : `${why} `}
      <Link href={recordHref(table, existing.id)} target="_blank" className={`text-text-primary underline underline-offset-2 ${focusRing}`}>
        {name}
      </Link>
    </span>
  );
}

/**
 * /admin/imports/csv?table=people|organizations — the CSV import (decision
 * of 2026-10-23, OPS-93/OPS-150), for roles with write access to the table:
 * 1. upload a CSV file (UTF-8, comma or semicolon, a header row, ≤ 2 MB);
 * 2. match each column to a field (matched automatically, changeable, or skipped);
 * 3. check: what will be added, possible duplicates (skipped unless
 *    included), rows with errors and why — nothing is written yet;
 * 4. import, all or nothing, then the toast and the report.
 * Figma has no frame for it: it uses the record page's header and panel
 * buttons (p11) and the toast (p12–13).
 */
export function ImportCsvScreen({ table }: { table: CsvTable }) {
  const router = useRouter();
  const toast = useToast();
  const allowed = useCan("directory.create");
  const noun = NOUN[table];
  const [step, setStep] = useState<Step>("Upload");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<CsvPreview | null>(null);
  const [mapping, setMapping] = useState<(string | null)[]>([]);
  const [include, setInclude] = useState<number[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<{ title: string; message: string; action: string } | null>(null);
  const [result, setResult] = useState<{ runId: string; counts: CsvCounts } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const inputId = useId();

  if (!allowed) {
    return (
      <RecordLayout backHref={noun.href} backLabel={noun.title} title={`Import CSV · ${noun.title}`}>
        <StatusMessage tone="error">Your role can&rsquo;t add {noun.many}, so it can&rsquo;t import them.</StatusMessage>
      </RecordLayout>
    );
  }

  async function check(chosen: File, options: { mapping?: (string | null)[]; include?: number[] }, next: Step) {
    setBusy("checking");
    try {
      const fresh = (await send(table, "preview", chosen, options)) as CsvPreview;
      setPreview(fresh);
      setMapping(fresh.mapping);
      setInclude(fresh.rows.filter((row) => row.included).map((row) => row.line));
      setStep(next);
    } catch (caught) {
      setProblem({ title: next === "Columns" ? "This file can't be imported" : "These columns can't be used", message: reason(caught), action: next === "Columns" ? "Choose another file" : "Change the columns" });
      if (next === "Columns") {
        setFile(null);
        if (input.current) input.current.value = "";
      }
    } finally {
      setBusy(null);
    }
  }

  function choose(chosen: File | undefined) {
    if (!chosen) return;
    if (chosen.size > MAX_BYTES) {
      setProblem({ title: "This file can't be imported", message: "The file is larger than 2 MB: split it into smaller files.", action: "Choose another file" });
      if (input.current) input.current.value = "";
      return;
    }
    setFile(chosen);
    void check(chosen, {}, "Columns");
  }

  async function confirm() {
    if (!file || !preview) return;
    setBusy("importing");
    try {
      const done = (await send(table, "confirm", file, { mapping: preview.mapping, include, expect: preview.counts })) as { runId: string; counts: CsvCounts };
      setResult(done);
      setStep("Done");
      const skipped = done.counts.duplicates;
      toast(`${plural(done.counts.create, `${noun.one} added`, `${noun.many} added`)}${skipped > 0 ? ` · ${skipped} not added (already existing)` : ""}`, {
        href: `/admin/imports/csv/${done.runId}`,
        label: "See the report",
      });
    } catch (caught) {
      setProblem({ title: "Nothing was imported", message: reason(caught), action: "Check again" });
      // The database may have changed: show the current check.
      await check(file, { mapping: preview.mapping, include }, "Check");
    } finally {
      setBusy(null);
    }
  }

  const fieldOf = (key: string) => preview?.fields.find((field) => field.key === key);
  const taken = (key: string, column: number) => mapping.some((chosen, index) => chosen === key && index !== column);
  const rows = (status: CsvPreviewRow["status"]) => preview?.rows.filter((row) => row.status === status && !(status === "create" && row.included)) ?? [];
  const flagged = preview?.rows.filter((row) => row.duplicate !== null) ?? [];

  const panel = (
    <div className="flex flex-col gap-2 pt-1">
      {step === "Columns" ? (
        <PanelButton icon="check_circle" onClick={() => file && void check(file, { mapping }, "Check")} disabled={busy !== null || !mapping.includes("name")}>
          {busy === "checking" ? "Checking…" : "Check the rows"}
        </PanelButton>
      ) : null}
      {step === "Check" && preview ? (
        <>
          <PanelButton icon="check_circle" onClick={() => void confirm()} disabled={busy !== null || preview.counts.create === 0}>
            {busy === "importing" ? "Importing…" : `Import ${plural(preview.counts.create, noun.one, noun.many)}`}
          </PanelButton>
          <PanelButton icon="arrow_back" onClick={() => setStep("Columns")} disabled={busy !== null}>
            Back to the columns
          </PanelButton>
        </>
      ) : null}
      {step !== "Done" && step !== "Upload" ? (
        <PanelButton
          icon="restart_alt"
          onClick={() => {
            setStep("Upload");
            setFile(null);
            setPreview(null);
          }}
          disabled={busy !== null}
        >
          Start again with another file
        </PanelButton>
      ) : null}
      <p className="px-1 text-meta text-text-muted">
        Nothing is written before &ldquo;Import&rdquo;; the import is all or nothing. Existing {noun.many} are never changed.
      </p>
    </div>
  );

  return (
    <RecordLayout backHref={noun.href} backLabel={noun.title} title={`Import CSV · ${noun.title}`} panel={panel}>
      <Stepper current={step} />

      {step === "Upload" ? (
        <section aria-labelledby={`${inputId}-title`} className="flex max-w-[720px] flex-col gap-2">
          <h2 id={`${inputId}-title`} className="font-bold">
            Choose a CSV file
          </h2>
          <p className="text-text-muted">
            UTF-8 text (&ldquo;CSV UTF-8&rdquo; in spreadsheets, or Notion&rsquo;s export), values separated by commas or semicolons, the first row naming the columns. Up to 2 MB
            and 5,000 rows.
          </p>
          <label
            htmlFor={inputId}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              choose(event.dataTransfer.files[0]);
            }}
            className="flex h-32 cursor-pointer flex-col items-center justify-center gap-1 rounded-control text-text-muted ring-1 ring-line ring-dashed focus-within:ring-text-primary hover:text-text-primary"
          >
            <AdminIcon name="insert_drive_file" />
            <span>{busy === "checking" ? "Reading the file…" : "Drop the file here, or click to choose it"}</span>
            <input ref={input} id={inputId} type="file" accept=".csv,text/csv" className="sr-only" onChange={(event) => choose(event.target.files?.[0])} disabled={busy !== null} />
          </label>
        </section>
      ) : null}

      {step === "Columns" && preview ? (
        <section aria-labelledby="csv-columns-title" className="flex flex-col gap-2">
          <h2 id="csv-columns-title" className="font-bold">
            Match the columns of {preview.fileName}
          </h2>
          <p className="max-w-[720px] text-text-muted">
            Each column is matched to a {noun.one}&rsquo;s field by its name. Change a match, or skip a column. Name is required. Display numbers (PER-, ORG-) are never imported.
          </p>
          <table className="w-full max-w-[880px] table-fixed border-separate border-spacing-0">
            <thead>
              <tr className="text-left text-text-muted">
                <th scope="col" className="h-8 px-1 font-normal">
                  Column in the file
                </th>
                <th scope="col" className="h-8 px-1 font-normal">
                  First values
                </th>
                <th scope="col" className="h-8 w-[260px] px-1 font-normal">
                  Field
                </th>
              </tr>
            </thead>
            <tbody>
              {preview.headers.map((header, column) => (
                <tr key={header}>
                  <th scope="row" className="truncate border-t border-line px-1 py-1 text-left font-bold">
                    {header}
                  </th>
                  <td className="truncate border-t border-line px-1 py-1 text-text-muted">{preview.samples[column]!.join(" · ") || "—"}</td>
                  <td className="border-t border-line px-1 py-1">
                    <label className="sr-only" htmlFor={`csv-field-${column}`}>
                      Field for {header}
                    </label>
                    <select
                      id={`csv-field-${column}`}
                      value={mapping[column] ?? ""}
                      onChange={(event) => setMapping((current) => current.map((value, index) => (index === column ? event.target.value || null : value)))}
                      className={`${recordInput} w-full cursor-pointer ring-1 ring-line`}
                    >
                      <option value="">Skip this column</option>
                      {preview.fields.map((field) => (
                        <option key={field.key} value={field.key} disabled={taken(field.key, column)}>
                          {field.label}
                          {field.required ? " (required)" : ""}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!mapping.includes("name") ? <StatusMessage tone="error">Choose the column that holds the {fieldOf("name")?.label ?? "Name"}.</StatusMessage> : null}
        </section>
      ) : null}

      {step === "Check" && preview ? (
        <section aria-labelledby="csv-check-title" className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <h2 id="csv-check-title" className="font-bold">
              Check before importing
            </h2>
            <CountsLine counts={preview.counts} noun={noun} />
          </div>

          <section aria-labelledby="csv-create-title" className="flex flex-col gap-1">
            <h3 id="csv-create-title" className="font-bold">
              To add ({rows("create").length})
            </h3>
            {rows("create").length === 0 ? (
              <p className="text-text-muted">No new {noun.many} in this file.</p>
            ) : (
              <ul className="flex max-h-60 flex-col overflow-y-auto">
                {rows("create").map((row) => (
                  <li key={row.line} className="flex min-h-8 items-center gap-2 border-b border-line px-1">
                    <span className="w-16 shrink-0 text-meta text-text-muted">Row {row.line}</span>
                    {row.name}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="csv-duplicates-title" className="flex flex-col gap-1">
            <h3 id="csv-duplicates-title" className="font-bold">
              Possible duplicates ({flagged.length})
            </h3>
            {flagged.length === 0 ? (
              <p className="text-text-muted">None: no row matches an existing {noun.one} by ID, email, website or name.</p>
            ) : (
              <>
                <p className="text-text-muted">Skipped unless you tick them: a ticked row is added as a new {noun.one}; the existing one is never changed.</p>
                <ul className="flex max-h-72 flex-col overflow-y-auto">
                  {flagged.map((row) => (
                    <li key={row.line} data-duplicate-row={row.line} className="flex min-h-8 items-center gap-2 border-b border-line px-1">
                      <input
                        id={`csv-include-${row.line}`}
                        type="checkbox"
                        checked={row.included}
                        disabled={busy !== null}
                        onChange={(event) => {
                          const next = event.target.checked ? [...include, row.line] : include.filter((line) => line !== row.line);
                          setInclude(next);
                          if (file) void check(file, { mapping: preview.mapping, include: next }, "Check");
                        }}
                        className={`size-4 shrink-0 cursor-pointer accent-text-primary ${focusRing}`}
                      />
                      <label htmlFor={`csv-include-${row.line}`} className="flex min-w-0 flex-1 cursor-pointer flex-wrap items-center gap-x-2">
                        <span className="w-16 shrink-0 text-meta text-text-muted">Row {row.line}</span>
                        <span className="font-bold">{row.name}</span>
                        <span className="sr-only">: import anyway.</span>
                      </label>
                      <DuplicateLine table={table} row={row} />
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          <section aria-labelledby="csv-errors-title" className="flex flex-col gap-1">
            <h3 id="csv-errors-title" className="font-bold">
              Rows with errors ({rows("error").length})
            </h3>
            {rows("error").length === 0 ? (
              <p className="text-text-muted">None.</p>
            ) : (
              <>
                <p className="text-text-muted">Not imported. Correct them in the file and import it again (rows already added will show as duplicates).</p>
                <ul className="flex max-h-72 flex-col overflow-y-auto">
                  {rows("error").map((row) => (
                    <li key={row.line} data-error-row={row.line} className="flex flex-col gap-0.5 border-b border-line px-1 py-1">
                      <span>
                        <span className="mr-2 text-meta text-text-muted">Row {row.line}</span>
                        <span className="font-bold">{row.name || "(no name)"}</span>
                      </span>
                      {row.errors.map((error) => (
                        <span key={error} className="flex items-center gap-1 text-meta">
                          <AdminIcon name="warning" />
                          {error}
                        </span>
                      ))}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </section>
      ) : null}

      {step === "Done" && result ? (
        <section aria-labelledby="csv-done-title" className="flex max-w-[720px] flex-col gap-2">
          <h2 id="csv-done-title" className="font-bold">
            Imported
          </h2>
          <p>
            {plural(result.counts.create, `${noun.one} added`, `${noun.many} added`)}
            {result.counts.duplicates > 0 ? `, ${result.counts.duplicates} not added (already existing)` : ""}
            {result.counts.errors > 0 ? `, ${plural(result.counts.errors, "row", "rows")} with errors left out` : ""}. Each new {noun.one}&rsquo;s history says it came from this CSV import.
          </p>
          <p className="flex flex-wrap gap-2">
            <AdminButtonLink href={`/admin/imports/csv/${result.runId}`} icon="insert_drive_file">
              See the report
            </AdminButtonLink>
            <AdminButton icon="arrow_back" onClick={() => router.push(noun.href)}>
              Back to {noun.title}
            </AdminButton>
          </p>
        </section>
      ) : null}

      {problem ? <ErrorDialog {...problem} onClose={() => setProblem(null)} /> : null}
    </RecordLayout>
  );
}
