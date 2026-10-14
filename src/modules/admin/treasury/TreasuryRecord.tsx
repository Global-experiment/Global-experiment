"use client";

import Link from "next/link";
import { useRef, useState, type ReactNode } from "react";
import { adminApi, AdminApiError } from "../api/client";
import { formatEntryNumber, type TreasuryDocument, type TreasuryEntry } from "../api/types";
import { useAdminData } from "../api/useAdminData";
import { AdminIcon, NotionMark } from "../ui/adminIcons";
import { AdminButton, focusRing, StatusMessage } from "../ui/controls";
import { AutoGrowTextarea, formatPanelDate, PanelButton, PanelRow, Pills, PropertyRow, RecordLayout } from "../ui/RecordForm";
import { useToast } from "../ui/Toast";
import {
  CADENCE_LABEL,
  DOCUMENT_ACCEPT,
  DOCUMENT_MAX_BYTES,
  DOCUMENT_TYPES,
  formatBytes,
  formatMoney,
  formatOccurred,
  managedLabel,
  modeLabel,
  PUBLICATION_LABEL,
  SOURCE_LABEL,
  TYPE_LABEL,
} from "./treasuryDisplay";

/** A value the admin can't change here: plain text, no field ring (only editable values look like fields). */
function ReadOnly({ children }: { children: ReactNode }) {
  return <span className="flex min-h-8 items-center px-2 break-words text-text-primary">{children ?? <span className="text-text-muted">—</span>}</span>;
}

const message = (caught: unknown, fallback: string) => (caught instanceof AdminApiError ? (caught.issues[0]?.message ?? caught.message) : fallback);

/**
 * /admin/treasury/[id] — one ledger entry on the record layout
 * (admin-desktop.pdf p12; the Treasury has no frame of its own).
 *
 * Data ownership (overview §2.1) decides what can change:
 * - Notion-managed expenses: every field is read-only, with the "Managed in
 *   Notion" badge and a link to the page — edit there, then import;
 * - Stripe entries: amounts and dates come from Stripe; only the internal
 *   note and the publication change here;
 * - publish, unpublish and review are offered only when the API's rules
 *   and settings allow them (`permissions`), with the reason otherwise;
 * - supporting documents (PDF, PNG, JPEG, ≤ 20 MB) on any entry — private,
 *   downloaded by admins only, never public.
 */
export function TreasuryRecord({ id }: { id: string }) {
  const toast = useToast();
  const entry = useAdminData<TreasuryEntry>(`/treasury/${id}`);
  const [note, setNote] = useState<{ version: string; value: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (entry.error || !entry.data) {
    return (
      <RecordLayout backHref="/admin/treasury" backLabel="Treasury" title="">
        {entry.error ? (
          <StatusMessage tone="error">{entry.error.status === 404 ? "This Treasury entry doesn’t exist." : entry.error.message}</StatusMessage>
        ) : (
          <StatusMessage>Loading entry…</StatusMessage>
        )}
      </RecordLayout>
    );
  }

  const loaded = entry.data;
  const version = `${loaded.id}@${loaded.updatedAt}`;
  const savedNote = loaded.internalNote ?? "";
  const draftNote = note?.version === version ? note.value : savedNote;
  const dirty = loaded.permissions.editInternalNote && draftNote.trim() !== savedNote.trim();
  const notion = loaded.managedBy === "notion";
  const { permissions } = loaded;

  async function run(label: string, action: () => Promise<unknown>, done: string) {
    setBusy(label);
    setError(null);
    try {
      await action();
      toast(done);
    } catch (caught) {
      setError(message(caught, "Couldn't save."));
    } finally {
      entry.reload();
      setBusy(null);
    }
  }

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    if (!dirty) return;
    void run("saving", () => adminApi(`/treasury/${id}`, { method: "PATCH", body: { internalNote: draftNote } }), "Internal note saved");
  };

  const publication = loaded.publication === "published" ? permissions.unpublish : permissions.publish;
  const panel = (
    <>
      <PanelRow icon="numbers" label="Number">
        {formatEntryNumber(loaded.number)}
      </PanelRow>
      <PanelRow icon="lock" label="Managed by">
        {managedLabel(loaded)}
      </PanelRow>
      <PanelRow icon="schedule" label="Last updated">
        {formatPanelDate(loaded.updatedAt)}
      </PanelRow>
      <PanelRow icon="schedule" label="Created">
        {formatPanelDate(loaded.createdAt)}
      </PanelRow>
      {loaded.importedAt ? (
        <PanelRow icon="sync" label="Imported">
          {formatPanelDate(loaded.importedAt)}
        </PanelRow>
      ) : null}
      <div className="mt-1 flex flex-col gap-2">
        <PanelButton
          icon="visibility"
          onClick={() =>
            void run(
              "publication",
              () => adminApi(`/treasury/${id}/${loaded.publication === "published" ? "unpublish" : "publish"}`, { method: "POST" }),
              loaded.publication === "published" ? "Unpublished" : "Published",
            )
          }
          disabled={!publication.allowed || busy !== null}
          title={publication.reason ?? undefined}
        >
          {busy === "publication" ? "Saving…" : loaded.publication === "published" ? "Unpublish" : "Publish"}
        </PanelButton>
        {!publication.allowed && publication.reason ? <p className="px-1 text-meta text-text-muted">{publication.reason}</p> : null}
        {permissions.editInternalNote ? (
          <>
            <PanelButton icon="restart_alt" onClick={() => setNote(null)} disabled={!dirty || busy !== null}>
              Discard changes
            </PanelButton>
            <PanelButton icon="check_circle" type="submit" disabled={!dirty || busy !== null}>
              {busy === "saving" ? "Submitting…" : "Submit changes"}
            </PanelButton>
          </>
        ) : null}
      </div>
    </>
  );

  return (
    <form onSubmit={save} noValidate className="h-full">
      <RecordLayout backHref="/admin/treasury" backLabel="Treasury" title={`${formatEntryNumber(loaded.number)} · ${loaded.name}`} panel={panel}>
        {notion ? (
          <div data-managed="notion" className="flex flex-wrap items-center gap-2 pl-1 text-body">
            <span className="inline-flex h-6 items-center gap-1 rounded-control px-2 font-bold ring-1 ring-line">
              <NotionMark />
              Managed in Notion
            </span>
            <span className="text-text-muted">Edit it in Notion, then run the Treasury import.</span>
            {loaded.notionUrl ? (
              <a href={loaded.notionUrl} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-1 underline underline-offset-2 ${focusRing}`}>
                Open in Notion
                <AdminIcon name="arrow_outward" />
              </a>
            ) : null}
          </div>
        ) : loaded.source === "stripe" ? (
          <div data-managed="stripe" className="flex flex-wrap items-center gap-2 pl-1 text-body">
            <span className="inline-flex h-6 items-center gap-1 rounded-control px-2 font-bold ring-1 ring-line">
              <AdminIcon name="lock" />
              From Stripe
            </span>
            <span className="text-text-muted">Amounts and dates come from Stripe; only the internal note and the publication change here.</span>
          </div>
        ) : null}
        {!loaded.livemode ? <StatusMessage>Stripe test mode: this entry is never public in production.</StatusMessage> : null}
        {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}

        <PropertyRow icon="title" label="Name">
          <ReadOnly>{loaded.name}</ReadOnly>
        </PropertyRow>
        <PropertyRow icon="select" label="Type">
          <ReadOnly>{TYPE_LABEL[loaded.type]}</ReadOnly>
        </PropertyRow>
        <PropertyRow icon="schedule" label="Date">
          <ReadOnly>{formatOccurred(loaded)}</ReadOnly>
        </PropertyRow>
        <PropertyRow icon="numbers" label="Amount">
          <ReadOnly>
            <span className="tabular-nums">{formatMoney(loaded.grossAmount, loaded.currency)}</span>
          </ReadOnly>
        </PropertyRow>
        <PropertyRow icon="numbers" label="Fee" hint={notion ? "Imported from Notion: the fee isn't known (recorded as 0, flagged)." : undefined}>
          <ReadOnly>
            <span className="tabular-nums">{formatMoney(loaded.feeAmount, loaded.currency)}</span>
          </ReadOnly>
        </PropertyRow>
        <PropertyRow icon="numbers" label="Net">
          <ReadOnly>
            <span className="tabular-nums">{formatMoney(loaded.netAmount, loaded.currency)}</span>
          </ReadOnly>
        </PropertyRow>
        {loaded.settlement ? (
          <PropertyRow icon="numbers" label="Settlement">
            <ReadOnly>
              <span className="tabular-nums">
                {`${formatMoney(loaded.settlement.grossAmount, loaded.settlement.currency)} − fee ${formatMoney(loaded.settlement.feeAmount, loaded.settlement.currency)} = ${formatMoney(loaded.settlement.netAmount, loaded.settlement.currency)} (rate ${loaded.settlement.exchangeRate})`}
              </span>
            </ReadOnly>
          </PropertyRow>
        ) : null}
        <PropertyRow icon="select" label="Cadence">
          <ReadOnly>{CADENCE_LABEL[loaded.cadence] ?? loaded.cadence}</ReadOnly>
        </PropertyRow>
        {loaded.type === "expense" ? (
          <>
            <PropertyRow icon="arrow_outward" label="Recipient">
              <ReadOnly>
                {loaded.recipient ? (
                  <Link href={`/admin/${loaded.recipient.kind === "person" ? "people" : "organizations"}/${loaded.recipient.id}`} className={`underline underline-offset-2 ${focusRing}`}>
                    {loaded.recipient.name}
                  </Link>
                ) : null}
              </ReadOnly>
            </PropertyRow>
            <PropertyRow icon="select" label="Expense types">
              <ReadOnly>{loaded.expenseTypes.length > 0 ? loaded.expenseTypes.map((type) => type.label).join(", ") : null}</ReadOnly>
            </PropertyRow>
          </>
        ) : null}
        {loaded.adjusts ? (
          <PropertyRow icon="arrow_outward" label="Adjusts">
            <ReadOnly>
              <Link href={`/admin/treasury/${loaded.adjusts.id}`} className={`underline underline-offset-2 ${focusRing}`}>
                {`Donation ${formatEntryNumber(loaded.adjusts.number)}`}
              </Link>
            </ReadOnly>
          </PropertyRow>
        ) : null}
        {loaded.adjustments.length > 0 ? (
          <PropertyRow icon="arrow_outward" label="Adjustments">
            <div className="flex flex-col px-2">
              {loaded.adjustments.map((adjustment) => (
                <Link key={adjustment.id} href={`/admin/treasury/${adjustment.id}`} className={`flex min-h-8 items-center underline underline-offset-2 ${focusRing}`}>
                  {`${TYPE_LABEL[adjustment.type as keyof typeof TYPE_LABEL] ?? adjustment.type} ${formatEntryNumber(adjustment.number)} · ${formatMoney(adjustment.grossAmount, loaded.currency)}`}
                </Link>
              ))}
            </div>
          </PropertyRow>
        ) : null}

        <PropertyRow
          icon="approval"
          label="Review status"
          hint={
            permissions.review.allowed
              ? loaded.reviewedAt
                ? `Last reviewed ${formatPanelDate(loaded.reviewedAt)}. Qualified and Not required need a recipient.`
                : "Qualified and Not required need a recipient."
              : (permissions.review.reason ?? undefined)
          }
        >
          {permissions.review.allowed ? (
            <Pills
              label="Review status"
              options={permissions.review.options.map((option) => ({ value: option.key, label: option.label }))}
              value={loaded.review.key}
              onChange={(value) =>
                void run("review", () => adminApi(`/treasury/${id}/review`, { method: "POST", body: { reviewStatus: value } }), "Review status saved")
              }
            />
          ) : (
            <ReadOnly>{loaded.review.label}</ReadOnly>
          )}
        </PropertyRow>
        <PropertyRow icon="visibility" label="Publication">
          <ReadOnly>{`${PUBLICATION_LABEL[loaded.publication]}${loaded.publishedAt ? ` · ${formatPanelDate(loaded.publishedAt)}` : ""}`}</ReadOnly>
        </PropertyRow>
        <PropertyRow icon="title" label="Public description" hint="Shown on the public Treasury page once the entry is qualified.">
          <ReadOnly>{loaded.publicDescription}</ReadOnly>
        </PropertyRow>
        <PropertyRow icon="select" label="Source">
          <ReadOnly>{`${SOURCE_LABEL[loaded.source]} · ${modeLabel(loaded)}`}</ReadOnly>
        </PropertyRow>
        <PropertyRow icon="numbers" label={loaded.source === "stripe" ? "Stripe ID" : "Transaction ID"}>
          <ReadOnly>{loaded.externalTransactionId ? <span className="font-mono text-meta">{loaded.externalTransactionId}</span> : null}</ReadOnly>
        </PropertyRow>
        {loaded.sourceAccountId ? (
          <PropertyRow icon="numbers" label="Source account">
            <ReadOnly>{loaded.sourceAccountId}</ReadOnly>
          </PropertyRow>
        ) : null}
        <PropertyRow icon="title" label="Internal note" htmlFor={permissions.editInternalNote ? "treasury-note" : undefined} hint="Admins only: never public.">
          {permissions.editInternalNote ? (
            <AutoGrowTextarea
              id="treasury-note"
              value={draftNote}
              onChange={(event) => setNote({ version, value: event.target.value })}
              maxLength={5000}
              placeholder="Notes for the admin team…"
            />
          ) : (
            <ReadOnly>{loaded.internalNote}</ReadOnly>
          )}
        </PropertyRow>
        <PropertyRow icon="insert_drive_file" label="Documents" hint="Invoices and receipts: PDF, PNG or JPEG up to 20 MB. Private: admins only.">
          <Documents entryId={id} documents={loaded.documentsList} onChange={entry.reload} />
        </PropertyRow>
      </RecordLayout>
    </form>
  );
}

function Documents({ entryId, documents, onChange }: { entryId: string; documents: TreasuryDocument[]; onChange: () => void }) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setError(null);
    if (!(DOCUMENT_TYPES as readonly string[]).includes(file.type)) return setError("Only PDF, PNG or JPEG files can be uploaded.");
    if (file.size > DOCUMENT_MAX_BYTES) return setError("Files can be at most 20 MB.");
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      await adminApi(`/treasury/${entryId}/documents`, { method: "POST", body: form });
      toast("Document uploaded");
      onChange();
    } catch (caught) {
      setError(message(caught, "Couldn't upload the document."));
    } finally {
      setUploading(false);
      if (input.current) input.current.value = "";
    }
  }

  async function remove(documentId: string) {
    setError(null);
    try {
      await adminApi(`/treasury/documents/${documentId}`, { method: "DELETE" });
      toast("Document deleted");
      onChange();
    } catch (caught) {
      setError(message(caught, "Couldn't delete the document."));
    } finally {
      setConfirming(null);
    }
  }

  return (
    <div className="flex max-w-[720px] flex-col gap-1">
      {documents.length > 0 ? (
        <ul aria-label="Supporting documents" className="flex flex-col">
          {documents.map((document) => (
            <li key={document.id} className="flex min-h-8 items-center gap-2 border-b border-line px-2">
              <AdminIcon name="insert_drive_file" />
              <a href={`/api/admin/treasury/documents/${document.id}`} download={document.fileName} className={`min-w-0 truncate underline underline-offset-2 ${focusRing}`}>
                {document.fileName}
              </a>
              <span className="shrink-0 text-meta text-text-muted">
                {`${formatBytes(document.sizeBytes)} · ${formatPanelDate(document.uploadedAt)}${document.uploadedBy ? ` · ${document.uploadedBy}` : ""}`}
              </span>
              <span className="ml-auto flex shrink-0 items-center gap-2">
                {confirming === document.id ? (
                  <>
                    <span className="text-meta">Delete this file?</span>
                    <AdminButton onClick={() => void remove(document.id)}>Delete</AdminButton>
                    <AdminButton onClick={() => setConfirming(null)}>Cancel</AdminButton>
                  </>
                ) : (
                  <AdminButton icon="close" onClick={() => setConfirming(document.id)} aria-label={`Delete ${document.fileName}`}>
                    Delete
                  </AdminButton>
                )}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="flex min-h-8 items-center px-2 text-text-muted">No documents yet.</p>
      )}
      <input
        ref={input}
        type="file"
        accept={DOCUMENT_ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      <AdminButton icon="add" onClick={() => input.current?.click()} disabled={uploading} className="mt-1 self-start">
        {uploading ? "Uploading…" : "Upload document"}
      </AdminButton>
      {error ? (
        <p role="alert" className="px-2 text-meta text-text-primary">
          {error}
        </p>
      ) : null}
    </div>
  );
}
