"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useId, useMemo, useState, type KeyboardEvent } from "react";
import type { ContentBlock } from "@/shared/content/types";
import { adminApi, AdminApiError } from "../api/client";
import type { CmsDocument, CmsDocumentListItem, CmsState, RecordHistory } from "../api/types";
import { useAdminData } from "../api/useAdminData";
import { RecordMeta } from "../record/RecordMeta";
import { RecordPage } from "../record/RecordPage";
import { useCan } from "../session";
import { AdminIcon } from "../ui/adminIcons";
import { AdminButton, focusRing, StatusMessage } from "../ui/controls";
import { invalidProps, PanelButton, Pills, PropertyRow, recordInput } from "../ui/RecordForm";
import { useToast } from "../ui/Toast";
import { CmsEditor } from "./CmsEditor";
import { sameBlocks } from "./editorContent";

const MAX_EXPERTISE = 10;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** "Version 0.1 scope" → "version-0-1-scope". */
export const slugify = (title: string) =>
  title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100)
    .replace(/-+$/, "");

interface Draft {
  title: string;
  slug: string;
  /** A new document's slug follows its title until edited. */
  slugEdited: boolean;
  expertise: string[];
  displayOrder: string;
  content: ContentBlock[];
  summary: string;
  status: CmsState;
}

const toDraft = (document: CmsDocument): Draft => ({
  title: document.latest.title,
  slug: document.latest.slug,
  slugEdited: true,
  expertise: document.latest.expertise,
  displayOrder: String(document.displayOrder),
  content: document.latest.content,
  summary: "",
  status: document.state,
});

const EMPTY: Draft = { title: "", slug: "", slugEdited: false, expertise: [], displayOrder: "0", content: [], summary: "", status: "draft" };

function errorsOf(draft: Draft): Partial<Record<"title" | "slug" | "displayOrder", string>> {
  const errors: Partial<Record<"title" | "slug" | "displayOrder", string>> = {};
  if (!draft.title.trim()) errors.title = "Add a title.";
  if (!draft.slug) errors.slug = "Add a slug.";
  else if (!SLUG.test(draft.slug)) errors.slug = "Use lowercase letters, numbers and single hyphens (like version-0-1-scope).";
  if (!/^-?\d+$/.test(draft.displayOrder.trim())) errors.displayOrder = "Use a whole number.";
  return errors;
}

/** What "Submit changes" will do, in the Status row's words. */
function statusNote(document: CmsDocument | null, status: CmsState, dirty: boolean): string {
  const live = document?.live?.number;
  switch (status) {
    case "published":
      return document?.state === "published" && !dirty && !document.hasDraft
        ? "On the website."
        : "Submit changes publishes them: visitors see them right away.";
    case "draft":
      return live && document?.state === "published"
        ? `Submit changes saves them as a draft: visitors keep seeing version ${live}.`
        : "Submit changes saves a draft. It isn't on the website.";
    case "unpublished":
      return "Submit changes takes this document off the website. Its versions are kept.";
    case "archived":
      return "Submit changes archives this document: it leaves the website and the list, and can be restored.";
  }
}

/**
 * A Documentation article (admin-desktop.pdf p10): Title, Expertise (up to
 * 10), Slug, Status, Display order and the record's details, then the
 * content in the rich-text editor (p10's lower half). The right panel —
 * Duplicate, Submit changes, More options (p11: Discard changes, Duplicate
 * as a draft, Archive), Versions — and the History. Every "Submit changes"
 * is a new revision (ADR 020); with Published selected and cms.publish it
 * goes live at once, otherwise it is saved as a draft.
 *
 * `id` null: a new document (cms.create), prefilled from `?from=<id>` when
 * opened by "Duplicate as a draft".
 */
export function DocumentRecord({ id }: { id: string | null }) {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const canEdit = useCan("cms.update");
  const canCreate = useCan("cms.create");
  const canPublish = useCan("cms.publish");
  const fromId = id ? null : params.get("from");
  const document = useAdminData<CmsDocument>(id ? `/cms/documents/${id}` : fromId ? `/cms/documents/${fromId}` : null);
  const all = useAdminData<CmsDocumentListItem[]>("/cms/documents");
  const history = useAdminData<RecordHistory>(id ? `/history/cms_document/${id}` : null);
  const [edit, setEdit] = useState<{ version: string; draft: Draft } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // Discard puts the saved content back into the editor.
  const [resets, setResets] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set());
  const touch = (key: string) => setTouched((previous) => (previous.has(key) ? previous : new Set(previous).add(key)));
  const suggestions = useMemo(() => [...new Set((all.data ?? []).flatMap((row) => row.expertise))].sort((a, b) => a.localeCompare(b)), [all.data]);

  const loaded = id ? document.data : null;
  if (id && (document.error || !loaded)) {
    return (
      <RecordPage backHref="/admin/documentation/manage" backLabel="Documentation" title="">
        {document.error ? (
          <div>
            <StatusMessage tone="error">{document.error.status === 404 ? "This document doesn’t exist." : document.error.message}</StatusMessage>
            {document.error.status !== 404 ? <AdminButton onClick={document.reload}>Retry</AdminButton> : null}
          </div>
        ) : (
          <StatusMessage>Loading document…</StatusMessage>
        )}
      </RecordPage>
    );
  }

  // A new document: empty, or a copy of the one "Duplicate as a draft" came from.
  const source = !id && fromId ? document.data : null;
  const base: Draft = loaded
    ? toDraft(loaded)
    : source
      ? {
          ...EMPTY,
          title: `${source.latest.title} (copy)`,
          slug: `${source.latest.slug}-copy`.slice(0, 100),
          slugEdited: true,
          expertise: source.latest.expertise,
          displayOrder: String(source.displayOrder),
          content: source.latest.content,
        }
      : EMPTY;
  const version = loaded ? `${loaded.id}@${loaded.updatedAt}@${loaded.latest.id}` : `new@${source?.id ?? ""}`;
  const draft = edit?.version === version ? edit.draft : base;
  const set = (patch: Partial<Draft>) => setEdit({ version, draft: { ...draft, ...patch } });
  const contentChanged = !sameBlocks(draft.content, base.content);
  const fieldsChanged =
    draft.title.trim() !== base.title.trim() ||
    draft.slug !== base.slug ||
    JSON.stringify(draft.expertise) !== JSON.stringify(base.expertise) ||
    draft.displayOrder.trim() !== base.displayOrder.trim();
  const statusChanged = draft.status !== base.status;
  const dirty = !id ? draft.title.trim() !== "" || contentChanged : contentChanged || fieldsChanged || statusChanged;
  const archived = loaded?.state === "archived";
  const editable = id ? canEdit && !archived : canCreate;
  const found = errorsOf(draft);
  const fieldErrors = Object.fromEntries(Object.entries(found).filter(([key]) => touched.has(key)));
  const published = loaded?.state === "published";

  const body = () => ({
    title: draft.title.trim(),
    slug: draft.slug,
    expertise: draft.expertise,
    displayOrder: Number(draft.displayOrder.trim()),
    content: draft.content,
    summary: draft.summary.trim() || null,
  });

  async function submit(): Promise<boolean> {
    if (Object.keys(found).length > 0) {
      setTouched(new Set([...touched, ...Object.keys(found)]));
      setError("Some fields need attention.");
      return false;
    }
    setBusy("saving");
    setError(null);
    try {
      if (!id) {
        await adminApi<CmsDocument>("/cms/documents", { method: "POST", body: { ...body(), publish: draft.status === "published" } });
        toast(draft.status === "published" ? "Document published" : "Draft saved");
        return true;
      }
      const current = loaded!;
      // The content and fields: one new revision (published at once when Published is chosen).
      const wantsPublish = draft.status === "published" && (current.state !== "published" || current.hasDraft || contentChanged || fieldsChanged);
      if (contentChanged || fieldsChanged || wantsPublish)
        await adminApi(`/cms/documents/${current.id}/revisions`, {
          method: "POST",
          body: { ...body(), publish: wantsPublish, baseRevisionId: current.latest.id },
        });
      if (draft.status === "unpublished" && current.state === "published") await adminApi(`/cms/documents/${current.id}/unpublish`, { method: "POST" });
      if (draft.status === "archived") await adminApi(`/cms/documents/${current.id}/archive`, { method: "POST" });
      toast(
        draft.status === "archived"
          ? "Document archived"
          : draft.status === "unpublished" && current.state === "published"
            ? "Document taken off the website"
            : wantsPublish
              ? "Changes published"
              : "Draft saved",
      );
      return true;
    } catch (caught) {
      setError(caught instanceof AdminApiError ? (caught.issues[0]?.message ?? caught.message) : "Couldn't save.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function run(label: string, request: () => Promise<unknown>, done: string) {
    setBusy(label);
    setError(null);
    try {
      await request();
      toast(done);
      document.reload();
      history.reload();
    } catch (caught) {
      setError(caught instanceof AdminApiError ? caught.message : "That didn't work.");
    } finally {
      setBusy(null);
    }
  }

  const statusOptions = (
    [
      { value: "published", label: "Published", enabled: canPublish && !archived },
      { value: "draft", label: "Draft", enabled: !archived },
      { value: "unpublished", label: "Unpublished", enabled: canPublish && !archived && (loaded?.state === "published" || loaded?.state === "unpublished") },
      { value: "archived", label: "Archived", enabled: !!id && !archived && (!published || canPublish) },
    ] as const
  ).filter((option) => option.enabled || option.value === draft.status);

  return (
    <RecordPage
      backHref="/admin/documentation/manage"
      backLabel="Documentation"
      title={draft.title || (id ? "" : "New document")}
      entity={id ? { type: "cms_document", id } : undefined}
      entityNoun="document"
      recordLink={(other) => `/admin/documentation/${other}`}
      readOnly={id ? !canEdit : !canCreate}
      revision={loaded ? `${loaded.updatedAt}|${loaded.state}|${loaded.latest.id}` : undefined}
      actions={{
        submit,
        discard: () => {
          setEdit(null);
          setError(null);
          setTouched(new Set());
          setResets((count) => count + 1);
        },
        duplicate:
          id && canCreate
            ? async () => {
                setBusy("duplicating");
                try {
                  const copy = await adminApi<CmsDocument>(`/cms/documents/${id}/duplicate`, { method: "POST" });
                  toast("Copy created");
                  router.push(`/admin/documentation/${copy.id}`);
                } catch (caught) {
                  setError(caught instanceof AdminApiError ? caught.message : "Couldn't duplicate.");
                } finally {
                  setBusy(null);
                }
              }
            : undefined,
        duplicateAsDraft: id && canCreate ? () => router.push(`/admin/documentation/new?from=${id}`) : undefined,
        archived,
        setArchived:
          id && (!published || canPublish)
            ? (value) =>
                run(
                  value ? "archiving" : "restoring",
                  () => adminApi(`/cms/documents/${id}/${value ? "archive" : "restore"}`, { method: "POST" }),
                  value ? "Document archived" : "Document restored",
                )
            : undefined,
        savedMessage: "Saved",
        dirty,
        busy,
      }}
      panelExtra={
        loaded ? (
          <>
            {loaded.hasDraft && canPublish && !dirty ? (
              <PanelButton
                icon="check_circle"
                onClick={() =>
                  void run(
                    "publishing",
                    () => adminApi(`/cms/documents/${loaded.id}/publish`, { method: "POST", body: { revisionId: loaded.latest.id } }),
                    "Draft published",
                  )
                }
                disabled={busy !== null}
              >
                {busy === "publishing" ? "Publishing…" : `Publish version ${loaded.latest.number}`}
              </PanelButton>
            ) : null}
            <PanelButton icon="schedule" onClick={() => router.push(`/admin/documentation/${loaded.id}/versions`)}>
              Versions
            </PanelButton>
          </>
        ) : null
      }
    >
      {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}
      <PropertyRow icon="title" label="Title" htmlFor="document-title" error={fieldErrors.title}>
        <input
          id="document-title"
          value={draft.title}
          onChange={(event) => set({ title: event.target.value, ...(draft.slugEdited ? {} : { slug: slugify(event.target.value) }) })}
          onBlur={() => touch("title")}
          {...invalidProps("document-title", fieldErrors.title)}
          maxLength={200}
          autoComplete="off"
          placeholder="Document title"
          className={recordInput}
        />
      </PropertyRow>
      <PropertyRow icon="expertise" label="Expertise" hint="Documents can have up to 10 expertise.">
        <ExpertiseTags value={draft.expertise} suggestions={suggestions} onChange={(expertise) => set({ expertise })} />
      </PropertyRow>
      <PropertyRow icon="title" label="Slug" htmlFor="document-slug" error={fieldErrors.slug}>
        <input
          id="document-slug"
          value={draft.slug}
          onChange={(event) => set({ slug: event.target.value.toLowerCase().replace(/\s+/g, "-"), slugEdited: true })}
          onBlur={() => touch("slug")}
          {...invalidProps("document-slug", fieldErrors.slug)}
          maxLength={100}
          autoComplete="off"
          spellCheck={false}
          placeholder="document-slug"
          className={recordInput}
        />
      </PropertyRow>
      <PropertyRow icon="select" label="Status">
        <div className="flex flex-col gap-1">
          <Pills
            label="Status"
            options={statusOptions.map(({ value, label }) => ({ value, label }))}
            value={draft.status}
            onChange={(value) => set({ status: value as CmsState })}
          />
          <p data-status-note className="text-meta text-text-muted">
            {statusNote(loaded ?? null, draft.status, contentChanged || fieldsChanged)}
            {loaded?.hasDraft && !dirty ? ` Version ${loaded.latest.number} is a draft; visitors see version ${loaded.live?.number}.` : ""}
          </p>
        </div>
      </PropertyRow>
      <PropertyRow icon="numbers" label="Display order" htmlFor="document-order" error={fieldErrors.displayOrder}>
        <input
          id="document-order"
          inputMode="numeric"
          value={draft.displayOrder}
          onChange={(event) => set({ displayOrder: event.target.value })}
          onBlur={() => touch("displayOrder")}
          {...invalidProps("document-order", fieldErrors.displayOrder)}
          className={`${recordInput} w-24`}
        />
      </PropertyRow>
      {loaded ? (
        <RecordMeta
          numberLabel="Document ID"
          number={`DOC-${loaded.number}`}
          updatedAt={loaded.updatedAt}
          createdAt={loaded.createdAt}
          lastEditedBy={loaded.latest.author}
          createdBy={loaded.createdBy}
        />
      ) : null}
      {editable && (contentChanged || fieldsChanged) && id ? (
        <PropertyRow icon="edit" label="What changed" htmlFor="document-summary">
          <input
            id="document-summary"
            value={draft.summary}
            onChange={(event) => set({ summary: event.target.value })}
            maxLength={500}
            placeholder="Optional, shown in Versions"
            className={recordInput}
          />
        </PropertyRow>
      ) : null}
      <section aria-label="Content" className="-mx-2 border-t border-line">
        <CmsEditor
          label="Document content"
          value={draft.content}
          onChange={(content) => set({ content })}
          readOnly={!editable}
          resetKey={`${version}:${resets}`}
        />
      </section>
    </RecordPage>
  );
}

/** Expertise as removable chips and a field (p10: "Search", chips with ×): Enter or a comma adds one; up to 10. */
function ExpertiseTags({ value, suggestions, onChange }: { value: string[]; suggestions: string[]; onChange: (next: string[]) => void }) {
  const [text, setText] = useState("");
  const listId = useId();
  const full = value.length >= MAX_EXPERTISE;
  const add = (raw: string) => {
    const tag = raw.trim().replace(/\s+/g, " ").slice(0, 80);
    setText("");
    if (!tag || full || value.some((existing) => existing.toLowerCase() === tag.toLowerCase())) return;
    onChange([...value, tag]);
  };
  const onKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      add(text);
    } else if (event.key === "Backspace" && text === "" && value.length > 0) onChange(value.slice(0, -1));
  };
  return (
    <div className="flex flex-col gap-2">
      <span className="relative flex items-center">
        <AdminIcon name="search" className="pointer-events-none absolute left-2 text-text-muted" />
        <input
          aria-label="Add an expertise"
          list={listId}
          value={text}
          disabled={full}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKey}
          onBlur={() => add(text)}
          placeholder={full ? "Up to 10 expertise" : "Search"}
          className={`${recordInput} pl-7`}
        />
        <datalist id={listId}>
          {suggestions
            .filter((tag) => !value.includes(tag))
            .map((tag) => (
              <option key={tag} value={tag} />
            ))}
        </datalist>
      </span>
      {value.length > 0 ? (
        <ul aria-label="Expertise" className="flex flex-wrap gap-2">
          {value.map((tag) => (
            <li key={tag} className="flex h-8 items-center gap-1 rounded-control pr-1 pl-2 text-body text-text-primary ring-1 ring-line">
              {tag}
              <button
                type="button"
                aria-label={`Remove ${tag}`}
                onClick={() => onChange(value.filter((item) => item !== tag))}
                className={`flex rounded-control ${focusRing}`}
              >
                <AdminIcon name="close" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
