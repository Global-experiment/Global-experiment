"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type ReactNode } from "react";
import { formatDateOnly } from "@/shared/format/dates";
import { Timestamp } from "@/shared/format/Timestamp";
import { adminApi, AdminApiError } from "../api/client";
import { formatEntryNumber, type RecordHistory, type TreasuryDocument, type TreasuryEntry } from "../api/types";
import { useAdminData } from "../api/useAdminData";
import { RecordMeta } from "../record/RecordMeta";
import { RecordPage } from "../record/RecordPage";
import { AdminIcon } from "../ui/adminIcons";
import { AdminButton, focusRing, StatusMessage } from "../ui/controls";
import { AutoGrowTextarea, PanelButton, Pills, PropertyRow } from "../ui/RecordForm";
import { useCan } from "../session";
import { useToast } from "../ui/Toast";
import {
  CADENCE_LABEL,
  DOCUMENT_ACCEPT,
  DOCUMENT_MAX_BYTES,
  DOCUMENT_TYPES,
  formatBytes,
  formatMoney,
  modeLabel,
  publicationLabel,
  SOURCE_LABEL,
  TYPE_LABEL,
} from "./treasuryDisplay";

/** A value the admin can't change here: plain text, no field ring (only editable values look like fields). */
function ReadOnly({ children }: { children: ReactNode }) {
  return <span className="flex min-h-8 items-center px-2 break-words text-text-primary">{children ?? <span className="text-text-muted">—</span>}</span>;
}

/** What "Submit changes" saves on an entry. */
interface Draft {
  internalNote: string;
  reviewStatus: string;
}

const message = (caught: unknown, fallback: string) => (caught instanceof AdminApiError ? (caught.issues[0]?.message ?? caught.message) : fallback);

/**
 * /admin/treasury/[id] — one ledger entry on the record page (prototype
 * p14's panel and history; the Treasury has no frame of its own).
 *
 * Data ownership (overview §2.1) decides what can change:
 * - the Treasury is edited here only (decision of 2026-10-23: no import, no
 *   export); expenses copied from Notion earlier are ordinary entries;
 * - Stripe entries: amounts and dates come from Stripe; only the internal
 *   note, the review and the publication change here;
 * - the internal note and the review status are saved together by "Submit
 *   changes" (one event); publish and unpublish are explicit panel actions,
 *   offered only when the API's rules and settings allow them;
 * - supporting documents (PDF, PNG, JPEG, ≤ 20 MB) on any entry — private,
 *   downloaded by admins only, never public.
 */
export function TreasuryRecord({ id }: { id: string }) {
  const router = useRouter();
  const toast = useToast();
  const canUpdate = useCan("treasury.update");
  const canReview = useCan("treasury.review");
  const canPublish = useCan("treasury.publish");
  const canDelete = useCan("treasury.delete");
  const entry = useAdminData<TreasuryEntry>(`/treasury/${id}`);
  const history = useAdminData<RecordHistory>(`/history/treasury_entry/${id}`);
  const [edit, setEdit] = useState<{ version: string; draft: Draft } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (entry.error || !entry.data) {
    return (
      <RecordPage backHref="/admin/treasury/manage" backLabel="Treasury" title="">
        {entry.error ? (
          <div>
            <StatusMessage tone="error">{entry.error.status === 404 ? "This Treasury entry doesn’t exist." : entry.error.message}</StatusMessage>
            {entry.error.status !== 404 ? <AdminButton onClick={entry.reload}>Retry</AdminButton> : null}
          </div>
        ) : (
          <StatusMessage>Loading entry…</StatusMessage>
        )}
      </RecordPage>
    );
  }

  const loaded = entry.data;
  // What the entry allows (the API's rules), narrowed to what the role allows.
  const permissions = {
    ...loaded.permissions,
    editInternalNote: loaded.permissions.editInternalNote && canUpdate,
    review: canReview ? loaded.permissions.review : { ...loaded.permissions.review, allowed: false, reason: "Your role can't review expenses." },
  };
  const version = `${loaded.id}@${loaded.updatedAt}@${loaded.archivedAt}`;
  const base: Draft = { internalNote: loaded.internalNote ?? "", reviewStatus: loaded.review.key };
  const draft = edit?.version === version ? edit.draft : base;
  const patch: { internalNote?: string; reviewStatus?: string } = {};
  if (permissions.editInternalNote && draft.internalNote.trim() !== base.internalNote.trim()) patch.internalNote = draft.internalNote;
  if (permissions.review.allowed && draft.reviewStatus !== base.reviewStatus) patch.reviewStatus = draft.reviewStatus;
  const dirty = Object.keys(patch).length > 0;
  const set = <Key extends keyof Draft>(key: Key, value: Draft[Key]) => setEdit({ version, draft: { ...draft, [key]: value } });
  const number = formatEntryNumber(loaded.number);

  async function submit(): Promise<boolean> {
    setBusy("saving");
    setError(null);
    try {
      await adminApi(`/treasury/${id}`, { method: "PATCH", body: patch });
      toast("Treasury entry updated");
      return true;
    } catch (caught) {
      setError(message(caught, "Couldn't save."));
      return false;
    } finally {
      setBusy(null);
    }
  }

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
      history.reload();
      setBusy(null);
    }
  }

  const published = loaded.publication === "published";
  const publication = published ? permissions.unpublish : permissions.publish;
  const publishAction = (
    <>
      <PanelButton
        icon="visibility"
        onClick={() => void run("publication", () => adminApi(`/treasury/${id}/${published ? "unpublish" : "publish"}`, { method: "POST" }), published ? "Unpublished" : "Published")}
        disabled={!publication.allowed || dirty || busy !== null}
        title={dirty ? "Submit or discard your changes first" : (publication.reason ?? undefined)}
      >
        {busy === "publication" ? "Saving…" : published ? "Unpublish" : "Publish"}
      </PanelButton>
      {!publication.allowed && publication.reason ? <p className="px-1 text-meta text-text-muted">{publication.reason}</p> : null}
    </>
  );

  return (
    <RecordPage
      backHref="/admin/treasury/manage"
      backLabel="Treasury"
      title={`${number} · ${loaded.name}`}
      entity={{ type: "treasury_entry", id }}
      entityNoun="entry"
      recordLink={(other) => `/admin/treasury/${other}`}
      panelExtra={canPublish ? publishAction : null}
      revision={loaded.updatedAt}
      readOnly={!canUpdate && !canReview && !canPublish}
      actions={{
        submit,
        discard: () => {
          setEdit(null);
          setError(null);
        },
        archived: loaded.archivedAt !== null,
        setArchived: !canUpdate ? undefined : (archived) => run(archived ? "archiving" : "restoring", () => adminApi(`/treasury/${id}/${archived ? "archive" : "restore"}`, { method: "POST" }), archived ? "Entry archived" : "Entry restored"),
        // Only manual entries can go: Stripe entries belong to the ledger.
        remove:
          loaded.source === "manual" && canDelete
            ? {
                confirmText: number,
                run: async (confirm) => {
                  await adminApi(`/treasury/${id}`, { method: "DELETE", body: { confirm } });
                  toast("Entry deleted");
                  router.push("/admin/treasury/manage");
                },
              }
            : undefined,
        savedMessage: "Treasury entry updated",
        dirty,
        busy,
      }}
    >
      {loaded.source === "stripe" ? (
        <div data-managed="stripe" className="flex flex-wrap items-center gap-2 pl-1 text-body">
          <span className="inline-flex h-6 items-center gap-1 rounded-control px-2 font-bold ring-1 ring-line">
            <AdminIcon name="lock" />
            From Stripe
          </span>
          <span className="text-text-muted">Amounts and dates come from Stripe; only the internal note, the review and the publication change here.</span>
        </div>
      ) : null}
      {!loaded.livemode ? (
        <StatusMessage>
          {loaded.publicNow
            ? "Stripe test mode: a sandbox payment, shown on the public Treasury (marked Test in production, until go-live)."
            : loaded.publication === "published"
              ? "Stripe test mode: a sandbox payment, not on the public Treasury (shown only before go-live, with treasury.show_test_donations on)."
              : "Stripe test mode: a sandbox payment, not real money."}
        </StatusMessage>
      ) : null}
      {loaded.sample ? (
        <StatusMessage>Sample entry: shown on the public Treasury marked Test until go-live; npm run api:purge-sample-treasury removes every sample.</StatusMessage>
      ) : null}
      {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}

      <PropertyRow icon="title" label="Name">
        <ReadOnly>{loaded.name}</ReadOnly>
      </PropertyRow>
      <PropertyRow icon="select" label="Type">
        <ReadOnly>{TYPE_LABEL[loaded.type]}</ReadOnly>
      </PropertyRow>
      <PropertyRow icon="calendar" label="Date">
        <ReadOnly>{loaded.occurredAt ? <Timestamp value={loaded.occurredAt} format="full" /> : formatDateOnly(loaded.occurredOn)}</ReadOnly>
      </PropertyRow>
      <PropertyRow icon="numbers" label="Amount">
        <ReadOnly>
          <span className="tabular-nums">{formatMoney(loaded.grossAmount, loaded.currency)}</span>
        </ReadOnly>
      </PropertyRow>
      <PropertyRow icon="numbers" label="Fee">
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
        hint={permissions.review.allowed ? "Qualified and Not required need a recipient." : (permissions.review.reason ?? undefined)}
      >
        {permissions.review.allowed ? (
          <Pills
            label="Review status"
            options={permissions.review.options.map((option) => ({ value: option.key, label: option.label }))}
            value={draft.reviewStatus}
            onChange={(value) => set("reviewStatus", value)}
          />
        ) : (
          <ReadOnly>{loaded.review.label}</ReadOnly>
        )}
      </PropertyRow>
      {loaded.reviewedAt ? (
        <PropertyRow icon="schedule" label="Last reviewed">
          <ReadOnly>
            <Timestamp value={loaded.reviewedAt} format="full" />
          </ReadOnly>
        </PropertyRow>
      ) : null}
      <PropertyRow icon="visibility" label="Publication">
        <ReadOnly>
          {publicationLabel(loaded)}
          {loaded.publishedAt ? (
            <>
              {" · "}
              <Timestamp value={loaded.publishedAt} format="full" />
            </>
          ) : null}
        </ReadOnly>
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
          <AutoGrowTextarea id="treasury-note" value={draft.internalNote} onChange={(event) => set("internalNote", event.target.value)} maxLength={5000} placeholder="Notes for the admin team…" />
        ) : (
          <ReadOnly>{loaded.internalNote}</ReadOnly>
        )}
      </PropertyRow>
      <PropertyRow icon="insert_drive_file" label="Documents" hint="Invoices and receipts: PDF, PNG or JPEG up to 20 MB. Private: admins only.">
        <Documents
          editable={canUpdate}
          entryId={id}
          documents={loaded.documentsList}
          onChange={() => {
            entry.reload();
            history.reload();
          }}
        />
      </PropertyRow>
      {loaded.importedAt ? (
        <PropertyRow icon="sync" label="Imported">
          <ReadOnly>
            <Timestamp value={loaded.importedAt} format="full" />
          </ReadOnly>
        </PropertyRow>
      ) : null}
      <RecordMeta
        numberLabel="Entry ID"
        number={number}
        updatedAt={loaded.updatedAt}
        createdAt={loaded.createdAt}
        lastEditedBy={history.data?.lastEditedBy?.label ?? null}
        createdBy={history.data?.createdBy?.label ?? (loaded.source === "stripe" ? "Automation" : null)}
      />
    </RecordPage>
  );
}

function Documents({ entryId, documents, onChange, editable }: { entryId: string; documents: TreasuryDocument[]; onChange: () => void; editable: boolean }) {
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
                {formatBytes(document.sizeBytes)} · <Timestamp value={document.uploadedAt} format="short" />
                {document.uploadedBy ? ` · ${document.uploadedBy}` : ""}
              </span>
              <span className="ml-auto flex shrink-0 items-center gap-2">
                {!editable ? null : confirming === document.id ? (
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
      {editable ? (
        <AdminButton icon="add" onClick={() => input.current?.click()} disabled={uploading} className="mt-1 self-start">
          {uploading ? "Uploading…" : "Upload document"}
        </AdminButton>
      ) : null}
      {error ? (
        <p role="alert" className="px-2 text-meta text-text-primary">
          {error}
        </p>
      ) : null}
    </div>
  );
}
