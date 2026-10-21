"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { formatCompact } from "@/shared/format/numbers";
import { adminApi, AdminApiError } from "../api/client";
import type { HistoryEntityType, RecordHistory } from "../api/types";
import { useAdminData } from "../api/useAdminData";
import { AdminIcon, type AdminIconName } from "../ui/adminIcons";
import { AdminButton, focusRing } from "../ui/controls";
import { PanelButton, useAdminTitle } from "../ui/RecordForm";
import { HistoryEvent } from "./HistoryFeed";
import { cameFromAdminPage } from "./navigationMemory";
import { useLeaveGuard } from "./useLeaveGuard";

export interface RecordActions {
  /** One "Submit changes" = one PATCH = one history event; on success the page goes back with `savedMessage`. */
  submit: () => Promise<boolean>;
  discard: () => void;
  duplicate?: () => Promise<void>;
  /** A new, unsaved record prefilled from what's on screen (More options). */
  duplicateAsDraft?: () => void;
  archived?: boolean;
  setArchived?: (archived: boolean) => Promise<void>;
  /** Permanent delete, owner only: what to type (the record's name or number) and the call. */
  remove?: { confirmText: string; run: (confirm: string) => Promise<void> };
  savedMessage: string;
  dirty: boolean;
  busy: string | null;
}

/**
 * A record's detail page (person-record prototype, Figma p10/p14): the 40px
 * header (back, title), the fields, and the right panel. The panel's
 * actions — Duplicate, Submit changes, More options — and the Views and
 * Edits counters stay fixed at the top; only the History list scrolls,
 * with the left menu's scrollbar padding.
 *
 * No autosave: nothing is saved until "Submit changes", which then returns
 * to the previous page with a toast. "Discard changes" restores the record;
 * leaving with unsaved changes asks first (useLeaveGuard).
 */
export function RecordPage({
  backHref,
  backLabel,
  title,
  entity,
  entityNoun = "record",
  actions,
  panelExtra,
  children,
  recordLink,
}: {
  backHref: string;
  backLabel: string;
  title: string;
  /** The record whose history and counters the panel shows; omitted while loading. */
  entity?: { type: HistoryEntityType; id: string };
  entityNoun?: string;
  actions?: RecordActions;
  /** Record-specific panel actions (Treasury: publish), between Submit changes and More options. */
  panelExtra?: ReactNode;
  children: ReactNode;
  recordLink?: (id: string) => string;
}) {
  useAdminTitle(title);
  const router = useRouter();
  const guard = useLeaveGuard(actions?.dirty ?? false);
  // One read of the history for the counters and the list.
  const history = useAdminData<RecordHistory>(entity ? `/history/${entity.type}/${entity.id}` : null);
  const { reload } = history;
  // Archiving or restoring is an event too: refresh the list when it happens.
  const archived = actions?.archived;
  useEffect(() => {
    if (archived !== undefined) reload();
  }, [archived, reload]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!actions || !actions.dirty || actions.busy) return;
    if (await actions.submit()) {
      guard.release();
      // Back to where the visitor came from (the list, a linked record…), or the list.
      if (cameFromAdminPage()) router.back();
      else router.push(backHref);
    }
  }

  return (
    // Prototype: the header sits over the fields only; the panel runs the full height beside them.
    <form onSubmit={(event) => void submit(event)} noValidate className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-10 shrink-0 items-center gap-2 px-2">
          <Link href={backHref} aria-label={`Back to ${backLabel}`} title={`Back to ${backLabel}`} className={`flex rounded-control ${focusRing}`}>
            <AdminIcon name="arrow_back" />
          </Link>
          {/* Loading (no actions yet): an empty heading, not "Untitled". */}
          <h1 className="min-w-0 truncate text-body font-bold">{title || (actions ? "Untitled" : "")}</h1>
          {actions?.archived ? <span className="rounded-full px-2 text-meta text-text-muted ring-1 ring-line">Archived</span> : null}
        </header>
        <div data-record-main className="min-h-0 flex-1 overflow-y-auto px-2 pt-2 pb-6">
          <div className="flex flex-col gap-4">{children}</div>
        </div>
      </div>
      <>
        {actions ? (
          <aside data-record-panel aria-label="Record actions and history" className="flex w-[clamp(280px,calc((100vw-240px)/3),400px)] shrink-0 flex-col shadow-[-1px_0_0_0_var(--color-line)]">
            <RecordPanelTop actions={actions} history={entity ? history : undefined} panelExtra={panelExtra} />
            {entity ? <HistoryList entity={entity} history={history} entityNoun={entityNoun} recordLink={recordLink} /> : null}
          </aside>
        ) : null}
      </>
    </form>
  );
}

type HistoryData = ReturnType<typeof useAdminData<RecordHistory>>;

function RecordPanelTop({ actions, history, panelExtra }: { actions: RecordActions; history?: HistoryData; panelExtra?: ReactNode }) {
  const [more, setMore] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const menuId = useId();
  const busy = actions.busy !== null;
  return (
    <div data-record-panel-top className="shrink-0 px-2 pt-2">
      <div className="flex flex-col gap-2">
        {actions.duplicate ? (
          <PanelButton
            icon="content_copy"
            onClick={() => void actions.duplicate!()}
            disabled={actions.dirty || busy}
            title={actions.dirty ? "Submit or discard your changes first" : "Create a copy and open it"}
          >
            {actions.busy === "duplicating" ? "Duplicating…" : "Duplicate"}
          </PanelButton>
        ) : null}
        <PanelButton icon="check_circle" type="submit" disabled={!actions.dirty || busy}>
          {actions.busy === "saving" ? "Submitting…" : "Submit changes"}
        </PanelButton>
        {panelExtra}
        <PanelButton icon="expand_more" aria-expanded={more} aria-controls={menuId} onClick={() => setMore((open) => !open)}>
          More options
        </PanelButton>
        <div id={menuId} hidden={!more} className="flex flex-col gap-2">
          <PanelButton icon="restart_alt" onClick={actions.discard} disabled={!actions.dirty || busy}>
            Discard changes
          </PanelButton>
          {actions.duplicateAsDraft ? (
            <PanelButton icon="content_copy" onClick={actions.duplicateAsDraft} disabled={busy}>
              Duplicate as a draft
            </PanelButton>
          ) : null}
          {actions.setArchived ? (
            <PanelButton icon={actions.archived ? "restart_alt" : "approval"} onClick={() => void actions.setArchived!(!actions.archived)} disabled={actions.dirty || busy} title={actions.dirty ? "Submit or discard your changes first" : undefined}>
              {actions.archived ? "Restore" : "Archive"}
            </PanelButton>
          ) : null}
          {actions.remove ? (
            <PanelButton icon="close" onClick={() => setConfirmDelete(true)} disabled={actions.dirty || busy}>
              Delete permanently
            </PanelButton>
          ) : null}
        </div>
      </div>
      {history ? <Counters history={history} /> : null}
      {confirmDelete && actions.remove ? <DeleteDialog confirmText={actions.remove.confirmText} onCancel={() => setConfirmDelete(false)} onConfirm={actions.remove.run} /> : null}
    </div>
  );
}

/** Views and Edits (prototype: eye 148 / pencil 27), compact numbers as the client's rules allow in counters. */
function Counters({ history }: { history: HistoryData }) {
  const counter = (icon: AdminIconName, value: number | undefined, label: string, testId: string) => (
    <div data-counter={testId} className="flex flex-col items-center">
      <span className="flex items-center gap-1 text-body font-bold tabular-nums">
        <AdminIcon name={icon} />
        <span title={value === undefined ? undefined : String(value)}>{value === undefined ? "–" : formatCompact(value)}</span>
      </span>
      <span className="text-meta text-text-muted">{label}</span>
    </div>
  );
  return (
    <div className="grid grid-cols-2 py-2">
      {counter("visibility", history.data?.views, "Views", "views")}
      {counter("edit", history.data?.edits, "Edits", "edits")}
    </div>
  );
}

/** The record's history: "History N", a comment box, then the events, newest first — the only part of the panel that scrolls. */
function HistoryList({
  entity,
  history,
  entityNoun,
  recordLink,
}: {
  entity: { type: HistoryEntityType; id: string };
  history: HistoryData;
  entityNoun: string;
  recordLink?: (id: string) => string;
}) {
  const path = `/history/${entity.type}/${entity.id}`;
  const viewed = useRef<string | null>(null);
  const { reload } = history;

  // Every opening counts (decision 11): one view per page load, then the counters refresh.
  useEffect(() => {
    if (viewed.current === path) return;
    viewed.current = path;
    void adminApi(`${path}/views`, { method: "POST" })
      .then(() => reload())
      .catch(() => {});
  }, [path, reload]);

  return (
    <section aria-labelledby="history-heading" className="flex min-h-0 flex-1 flex-col border-t border-line">
      <h2 id="history-heading" className="flex h-10 shrink-0 items-center gap-1 px-2 text-body font-bold">
        History <span className="text-meta font-normal text-text-muted">{history.data ? history.data.total : ""}</span>
      </h2>
      <div data-history-scroll className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-2">
        <CommentBox path={path} onPosted={reload} />
        {history.error ? (
          <p role="alert" className="px-2 py-3 text-meta text-text-primary">
            Couldn&rsquo;t load the history: {history.error.message}
          </p>
        ) : !history.data ? (
          <p role="status" className="px-2 py-3 text-meta text-text-muted">
            Loading the history…
          </p>
        ) : (
          <ol aria-label="History, newest first" className="border-t border-line">
            {history.data.items.map((item) => (
              <HistoryEvent key={item.id} item={item} entity={entityNoun} recordLink={recordLink} onChanged={reload} />
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

function CommentBox({ path, onPosted }: { path: string; onPosted: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  const post = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await adminApi(`${path}/comments`, { method: "POST", body: { body: text } });
      setText("");
      onPosted();
    } catch (caught) {
      setError(caught instanceof AdminApiError ? caught.message : "Couldn't post the comment.");
    } finally {
      setBusy(false);
    }
  }, [path, text, onPosted]);
  return (
    <div className="flex flex-col gap-2 px-2 pb-3">
      <label htmlFor={id} className="sr-only">
        Leave a comment
      </label>
      <textarea
        id={id}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          // The comment box never submits the record.
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && text.trim()) {
            event.preventDefault();
            void post();
          }
        }}
        rows={2}
        maxLength={5000}
        placeholder="Leave a comment"
        className="w-full resize-y rounded-control bg-transparent p-2 text-meta text-text-primary ring-1 ring-line outline-none placeholder:text-text-muted hover:ring-text-muted focus-visible:ring-text-primary"
      />
      {text.trim() ? (
        <p>
          <AdminButton onClick={() => void post()} disabled={busy}>
            {busy ? "Posting…" : "Comment"}
          </AdminButton>
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-meta text-text-primary">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Permanent delete (owner only, decision 12): type the record's name or number to confirm. */
function DeleteDialog({ confirmText, onCancel, onConfirm }: { confirmText: string; onCancel: () => void; onConfirm: (confirm: string) => Promise<void> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      aria-labelledby={`${inputId}-title`}
      onClose={onCancel}
      className="m-auto w-[420px] rounded-control border border-line bg-surface-base p-3 text-body text-text-primary backdrop:bg-black/60"
    >
      <h2 id={`${inputId}-title`} className="font-bold">
        Delete permanently?
      </h2>
      <p className="mt-2 text-text-muted">This can&rsquo;t be undone. The history keeps a record that it was deleted. To confirm, type:</p>
      <p className="mt-1 font-bold">{confirmText}</p>
      <label htmlFor={inputId} className="sr-only">
        Type {confirmText} to confirm
      </label>
      <input
        id={inputId}
        value={typed}
        onChange={(event) => setTyped(event.target.value)}
        autoComplete="off"
        className="mt-2 h-8 w-full rounded-control bg-transparent px-2 ring-1 ring-line outline-none focus-visible:ring-text-primary"
      />
      {error ? (
        <p role="alert" className="mt-2 text-meta">
          {error}
        </p>
      ) : null}
      <p className="mt-3 flex justify-end gap-2">
        <AdminButton onClick={() => dialog.current?.close()} disabled={busy}>
          Cancel
        </AdminButton>
        <AdminButton
          disabled={typed.trim() !== confirmText || busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await onConfirm(typed.trim());
            } catch (caught) {
              setError(caught instanceof AdminApiError ? caught.message : "Couldn't delete.");
              setBusy(false);
            }
          }}
        >
          {busy ? "Deleting…" : "Delete permanently"}
        </AdminButton>
      </p>
    </dialog>
  );
}
