"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ContentBlock } from "@/shared/content/types";
import { adminApi, AdminApiError } from "../api/client";
import type { CmsDocument } from "../api/types";
import { useAdminData } from "../api/useAdminData";
import { RecordPage } from "../record/RecordPage";
import { useCan } from "../session";
import { AdminButton, StatusMessage } from "../ui/controls";
import { formatPanelDate, PanelButton, PanelRow } from "../ui/RecordForm";
import { useToast } from "../ui/Toast";
import { CmsEditor } from "./CmsEditor";
import { sameBlocks } from "./editorContent";

/**
 * Home's editor (admin-desktop.pdf p7), behind Administrate on Home: the
 * toolbar and the content, then the panel — Last publish, Created, Discard
 * changes, Submit changes — and the History. "Submit changes" is a new
 * revision; with cms.publish it goes live at once (and Home's cache is
 * revalidated), without it it's saved as a draft for someone who can
 * publish (ADR 020). Versions opens every revision.
 */
export function HomeEditor() {
  const router = useRouter();
  const toast = useToast();
  const canEdit = useCan("cms.update");
  const canPublish = useCan("cms.publish");
  const home = useAdminData<{ home: CmsDocument | null }>("/cms/home");
  const [edit, setEdit] = useState<{ version: string; content: ContentBlock[] } | null>(null);
  const [summary, setSummary] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  // Discard puts the saved content back into the editor.
  const [resets, setResets] = useState(0);
  const [error, setError] = useState<string | null>(null);

  if (home.error || !home.data) {
    return (
      <RecordPage backHref="/admin/home" backLabel="Home" title="Home">
        {home.error ? (
          <div>
            <StatusMessage tone="error">{home.error.message}</StatusMessage>
            <AdminButton onClick={home.reload}>Retry</AdminButton>
          </div>
        ) : (
          <StatusMessage>Loading Home…</StatusMessage>
        )}
      </RecordPage>
    );
  }

  const document = home.data.home;
  const version = document ? `${document.id}@${document.latest.id}@${document.updatedAt}` : "none";
  const base = document?.latest.content ?? [];
  const content = edit?.version === version ? edit.content : base;
  const dirty = !sameBlocks(content, base);

  async function submit(): Promise<boolean> {
    setBusy("saving");
    setError(null);
    try {
      await adminApi<CmsDocument>("/cms/home/revisions", {
        method: "POST",
        body: { content, summary: summary.trim() || null, publish: canPublish, baseRevisionId: document?.latest.id ?? null },
      });
      toast(canPublish ? "Home published" : "Draft saved: someone who can publish will publish it");
      setEdit(null);
      setSummary("");
      home.reload();
      router.refresh();
      return true;
    } catch (caught) {
      setError(caught instanceof AdminApiError ? (caught.issues[0]?.message ?? caught.message) : "Couldn't save.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function publishDraft() {
    if (!document) return;
    setBusy("publishing");
    setError(null);
    try {
      await adminApi(`/cms/documents/${document.id}/publish`, { method: "POST", body: { revisionId: document.latest.id } });
      toast("Home published");
      home.reload();
    } catch (caught) {
      setError(caught instanceof AdminApiError ? caught.message : "Couldn't publish.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <RecordPage
      backHref="/admin/home"
      backLabel="Home"
      title="Home"
      entity={document ? { type: "cms_document", id: document.id } : undefined}
      entityNoun="page"
      readOnly={!canEdit}
      afterSubmit="stay"
      revision={document ? `${document.updatedAt}|${document.latest.id}` : undefined}
      panelTop={
        <div className="mb-2">
          <PanelRow icon="schedule" label="Last publish">
            {document?.live ? formatPanelDate(document.live.publishedAt) : "Not published"}
          </PanelRow>
          <PanelRow icon="schedule" label="Created">
            {document ? formatPanelDate(document.createdAt) : "Not yet"}
          </PanelRow>
        </div>
      }
      actions={{
        submit,
        discard: () => {
          setEdit(null);
          setSummary("");
          setError(null);
          setResets((count) => count + 1);
        },
        inlineDiscard: true,
        savedMessage: canPublish ? "Home published" : "Draft saved",
        dirty,
        busy,
      }}
      panelExtra={
        document ? (
          <>
            {document.hasDraft && canPublish && !dirty ? (
              <PanelButton icon="check_circle" onClick={() => void publishDraft()} disabled={busy !== null}>
                {busy === "publishing" ? "Publishing…" : `Publish version ${document.latest.number}`}
              </PanelButton>
            ) : null}
            <PanelButton icon="schedule" onClick={() => router.push("/admin/home/versions")}>
              Versions
            </PanelButton>
          </>
        ) : null
      }
    >
      {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}
      {document?.hasDraft && !dirty ? (
        <StatusMessage>
          Version {document.latest.number} is a draft; visitors see version {document.live?.number ?? "–"}.
        </StatusMessage>
      ) : null}
      {canEdit && !canPublish ? <StatusMessage>Your role saves drafts; someone who can publish puts them on the website.</StatusMessage> : null}
      <section aria-label="Content" className="-mx-2 -mt-2">
        <CmsEditor
          label="Home content"
          value={content}
          onChange={(next) => setEdit({ version, content: next })}
          readOnly={!canEdit}
          resetKey={`${version}:${resets}`}
        />
      </section>
      {canEdit && dirty ? (
        <label className="flex flex-col gap-1 text-meta text-text-muted">
          What changed (optional, shown in Versions)
          <input
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            maxLength={500}
            className="h-8 rounded-control bg-transparent px-2 text-body text-text-primary ring-1 ring-line"
          />
        </label>
      ) : null}
    </RecordPage>
  );
}
