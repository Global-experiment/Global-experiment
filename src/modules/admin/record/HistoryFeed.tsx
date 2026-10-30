"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { formatDateOnly, formatShortDateTime } from "@/shared/format/dates";
import { formatInteger } from "@/shared/format/numbers";
import { Timestamp, useViewerTimeZone } from "@/shared/format/Timestamp";
import { adminApi, AdminApiError } from "../api/client";
import type { HistoryChange, HistoryFieldKind, HistoryItem, HistoryValue } from "../api/types";
import { AdminIcon, type AdminIconName } from "../ui/adminIcons";
import { AdminButton, focusRing } from "../ui/controls";
import { historyHeadline, historyPageHeadline, isEmptyValue, PRIVATE_NOTE_TEXT, relationDiff, shortUrl } from "./historyText";

const KIND_ICON: Record<HistoryFieldKind, AdminIconName> = {
  text: "title",
  email: "alternate_email",
  url: "link",
  number: "tag",
  date: "calendar",
  datetime: "calendar",
  boolean: "check_box",
  select: "select",
  relation: "arrow_outward",
};

const chip = "inline-flex min-h-6 items-center rounded-control px-1 text-meta text-text-primary ring-1 ring-line";
const pill = "inline-flex min-h-6 items-center rounded-full px-2 text-meta text-text-primary ring-1 ring-line";

/** A field label line of an event: its type glyph and name (Figma: "T Name", "@ Email", "↗ Expenses"). */
function FieldLabel({ icon, children }: { icon: AdminIconName; children: ReactNode }) {
  return (
    <p className="mt-2 flex items-center gap-1 text-meta text-text-muted">
      <AdminIcon name={icon} />
      {children}
    </p>
  );
}

function Scalar({ value, kind, struck, timeZone }: { value: HistoryValue; kind: HistoryFieldKind; struck?: boolean; timeZone: string }) {
  const tone = struck ? "text-text-muted line-through" : "text-text-primary";
  if (isEmptyValue(value)) return <span className={struck ? "text-text-muted line-through" : "text-text-muted"}>Not set</span>;
  if (typeof value === "object" && value !== null && !Array.isArray(value)) return <span className={`${pill} ${struck ? "text-text-muted line-through" : ""}`}>{value.label}</span>;
  if (typeof value === "boolean") return <span className={tone}>{value ? "Yes" : "No"}</span>;
  if (typeof value === "number") return <span className={`${tone} tabular-nums`}>{formatInteger(value)}</span>;
  const text = String(value);
  if (kind === "date") return <span className={tone}>{formatDateOnly(text)}</span>;
  if (kind === "datetime") return <span className={tone}>{formatShortDateTime(text, timeZone)}</span>;
  if (kind === "url" || kind === "email") return <span className={`${tone} underline underline-offset-2`}>{kind === "url" ? shortUrl(text) : text}</span>;
  return <span className={`${tone} whitespace-pre-line`}>{text}</span>;
}

/** One changed field: old value struck through → new (relations as chips, selects as pills). */
function ChangeRow({ change, timeZone }: { change: HistoryChange; timeZone: string }) {
  if (change.redacted) {
    return (
      <div data-change={change.field}>
        <FieldLabel icon={KIND_ICON[change.kind]}>{change.label}</FieldLabel>
        <p className="mt-1 text-meta text-text-primary">
          {PRIVATE_NOTE_TEXT[0]}
          <br />
          {PRIVATE_NOTE_TEXT[1]}
        </p>
      </div>
    );
  }
  if (change.kind === "relation") {
    const { removed, added } = relationDiff(change);
    // Only the order changed (drag and drop): the old order struck through, then the new one.
    if (removed.length === 0 && added.length === 0) {
      const list = (value: HistoryChange["before"]) => (Array.isArray(value) ? value : []);
      return (
        <div data-change={change.field} data-reordered>
          <FieldLabel icon="arrow_outward">{change.label}</FieldLabel>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-meta">
            {list(change.before).map((item) => (
              <span key={`-${item.id}`} className={`${chip} text-text-muted line-through`}>
                {item.label}
              </span>
            ))}
            <span aria-label="changed to" className="text-text-muted">→</span>
            {list(change.after).map((item) => (
              <span key={`+${item.id}`} className={chip}>
                {item.label}
              </span>
            ))}
          </p>
        </div>
      );
    }
    return (
      <div data-change={change.field}>
        <FieldLabel icon="arrow_outward">{change.label}</FieldLabel>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-meta">
          {removed.map((item) => (
            <span key={`-${item.id}`} className={`${chip} text-text-muted line-through`}>
              {item.label}
            </span>
          ))}
          {removed.length > 0 && added.length > 0 ? <span aria-label="changed to" className="text-text-muted">→</span> : null}
          {added.map((item) => (
            <span key={`+${item.id}`} className={chip}>
              {item.label}
            </span>
          ))}
        </p>
      </div>
    );
  }
  const created = isEmptyValue(change.before);
  return (
    <div data-change={change.field}>
      <FieldLabel icon={KIND_ICON[change.kind]}>{change.label}</FieldLabel>
      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-meta">
        {created ? null : (
          <>
            <Scalar value={change.before} kind={change.kind} struck timeZone={timeZone} />
            <span aria-label="changed to" className="text-text-muted">
              →
            </span>
          </>
        )}
        <Scalar value={change.after} kind={change.kind} timeZone={timeZone} />
      </p>
    </div>
  );
}

function Context({ item, recordLink }: { item: HistoryItem; recordLink?: (id: string) => string }) {
  const { meta } = item;
  if (item.action === "created" && meta.collection) {
    return (
      <>
        <FieldLabel icon="arrow_outward">{meta.collection}</FieldLabel>
        <p className="mt-1">
          <span className={chip}>{String(meta.label ?? "").replace(/^[A-Z]+-\d+ · /, "")}</span>
        </p>
      </>
    );
  }
  if (item.action === "imported") {
    return (
      <>
        <FieldLabel icon="title">Import source</FieldLabel>
        <p className="mt-1 text-meta text-text-primary">
          {meta.importSource ?? "Notion"}
          {meta.preservedCreation ? (
            <>
              <br />
              Existing creation metadata preserved.
            </>
          ) : null}
        </p>
      </>
    );
  }
  if (item.action === "duplicated" && meta.duplicatedFrom) {
    const href = recordLink?.(meta.duplicatedFrom.id);
    return (
      <>
        <FieldLabel icon="arrow_outward">Duplicated from</FieldLabel>
        <p className="mt-1">
          {href ? (
            <Link href={href} className={`${chip} hover:underline ${focusRing}`}>
              {meta.duplicatedFrom.label}
            </Link>
          ) : (
            <span className={chip}>{meta.duplicatedFrom.label}</span>
          )}
        </p>
      </>
    );
  }
  if (item.action === "comment_deleted" && typeof meta.body === "string") {
    return <p className="mt-2 text-meta whitespace-pre-line text-text-muted line-through">{meta.body}</p>;
  }
  // A permanently deleted Treasury entry: what it was, since its page is gone.
  if (item.action === "deleted" && Array.isArray(meta.details) && meta.details.length > 0) {
    return (
      <dl data-deleted-details className="mt-2 grid grid-cols-[max-content_minmax(0,1fr)] gap-x-2 text-meta">
        {meta.details.map((detail) => (
          <div key={detail.label} className="contents">
            <dt className="text-text-muted">{detail.label}</dt>
            <dd className="text-text-primary">{detail.value}</dd>
          </div>
        ))}
      </dl>
    );
  }
  // Accounts and access (Delivery 2): the facts the event carries, never a link or a token.
  const facts: string[] = [];
  if (typeof meta.note === "string") facts.push(meta.note);
  if (item.action === "invited" && typeof meta.role === "string") facts.push(`Role: ${meta.role}.`);
  if (item.action === "link_created" && typeof meta.purpose === "string") facts.push(`${meta.purpose}, valid 72 hours, single use.`);
  if ((item.action === "activated" || item.action === "password_changed") && typeof meta.via === "string") facts.push(`With the ${meta.via.toLowerCase()}.`);
  if (item.action === "deactivated" && meta.self === true) facts.push("Deactivated from Profile settings.");
  if (item.action === "permission_denied" && typeof meta.route === "string") facts.push(`${meta.route} needs ${String(meta.permission)}.`);
  if (facts.length > 0 && meta.origin && item.actor.type === "automation") facts.push(`By the ${String(meta.origin)} command.`);
  if (facts.length > 0) return <p className="mt-2 text-meta text-text-muted">{facts.join(" ")}</p>;
  if (meta.origin && item.actor.type === "automation") {
    return <p className="mt-2 text-meta text-text-muted">{meta.origin === "Stripe" ? "From Stripe." : `By the ${String(meta.origin)} command.`}</p>;
  }
  return null;
}

/** A comment the viewer wrote: edit (the text, in place) or delete it; both stay in the history. */
function CommentBody({ item, onChanged }: { item: HistoryItem; onChanged: () => void }) {
  const comment = item.comment!;
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(comment.current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(request: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await request();
      setEditing(false);
      onChanged();
    } catch (caught) {
      setError(caught instanceof AdminApiError ? caught.message : "Couldn't save the comment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <p data-comment-body className={`mt-2 text-meta whitespace-pre-line ${comment.deleted ? "text-text-muted line-through" : "text-text-primary"}`}>
        {comment.body}
      </p>
      {comment.deleted ? <p className="mt-1 text-meta text-text-muted">Deleted.</p> : null}
      {comment.mine && !editing ? (
        <p className="mt-2 flex justify-end gap-2">
          <AdminButton onClick={() => setEditing(true)} disabled={busy}>
            Edit
          </AdminButton>
          <AdminButton onClick={() => void run(() => adminApi(`/comments/${comment.id}`, { method: "DELETE" }))} disabled={busy}>
            {busy ? "Deleting…" : "Delete"}
          </AdminButton>
        </p>
      ) : null}
      {editing ? (
        <div className="mt-2 flex flex-col gap-2">
          <label className="sr-only" htmlFor={`edit-${comment.id}`}>
            Edit your comment
          </label>
          <textarea
            id={`edit-${comment.id}`}
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={4}
            maxLength={5000}
            className="w-full resize-y rounded-control bg-transparent p-2 text-meta text-text-primary ring-1 ring-line outline-none focus-visible:ring-text-primary"
          />
          <p className="flex gap-2">
            <AdminButton onClick={() => void run(() => adminApi(`/comments/${comment.id}`, { method: "PATCH", body: { body: text } }))} disabled={busy || !text.trim()}>
              {busy ? "Saving…" : "Save comment"}
            </AdminButton>
            <AdminButton
              onClick={() => {
                setEditing(false);
                setText(comment.current);
              }}
              disabled={busy}
            >
              Cancel
            </AdminButton>
          </p>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="mt-1 text-meta text-text-primary">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * One history event (person-record prototype): the actor (avatar disc, bold
 * name — "Automation" for imports, Stripe and jobs), what they did, the
 * short exact time in the viewer's time zone, then the fields old → new.
 */
export function HistoryEvent({
  item,
  entity = "record",
  recordLink,
  onChanged,
  subject,
  menu,
}: {
  item: HistoryItem;
  entity?: string;
  recordLink?: (id: string) => string;
  onChanged: () => void;
  /** On the History page: the record this event is about (its title, linked), named in the sentence. */
  subject?: ReactNode;
  /** On the History page: the event's ⋮ menu (Report issue, Send feedback). */
  menu?: ReactNode;
}) {
  const page = subject ? historyPageHeadline(item, entity) : null;
  const timeZone = useViewerTimeZone();
  const oneLine = item.action === "viewed" || item.action === "archived" || item.action === "restored";
  return (
    <li data-history-item={item.action} className={`border-b border-line px-2 ${oneLine ? "py-2" : "pt-2 pb-3"}`}>
      {/* A div, not a p: the History page's ⋮ menu (a popover) sits in this line. */}
      <div className="flex items-start gap-2 text-meta">
        <span aria-hidden="true" className="mt-px size-4 shrink-0 rounded-full bg-avatar" />
        <span className="min-w-0 flex-1">
          <span className="font-bold text-text-primary">{item.actor.label}</span>{" "}
          {page ? (
            <>
              <span className="text-text-muted">{page.before}</span> {subject}
              {page.after ? <span className="text-text-muted"> {page.after}</span> : null}
            </>
          ) : (
            <span className="text-text-muted">{historyHeadline(item, entity)}</span>
          )}
        </span>
        <Timestamp value={item.occurredAt} format="short" className="shrink-0 text-text-muted" />
        {menu}
      </div>
      {item.comment ? <CommentBody item={item} onChanged={onChanged} /> : null}
      <Context item={item} recordLink={recordLink} />
      {item.changes.map((change) => (
        <ChangeRow key={change.field} change={change} timeZone={timeZone} />
      ))}
    </li>
  );
}

