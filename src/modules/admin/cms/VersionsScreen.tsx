"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { DocumentationContent } from "@/modules/documentation/ui/DocumentationContent";
import { Timestamp } from "@/shared/format/Timestamp";
import { adminApi, AdminApiError } from "../api/client";
import type { CmsDocument, CmsRevision, CmsRevisionSummary } from "../api/types";
import { useAdminData } from "../api/useAdminData";
import { useCan } from "../session";
import { AdminButton, focusRing, StatusMessage } from "../ui/controls";
import { RecordLayout } from "../ui/RecordForm";
import { useToast } from "../ui/Toast";
import { compareBlocks } from "./compare";

/**
 * Versions of a Home or Documentation page (OPS-28): every revision, newest
 * first, with who saved it, when, its summary and whether visitors see it.
 * Open one to read it, or compare it with the current version (removed
 * blocks struck through, added ones marked). Restoring makes a NEW revision
 * with that version's content — nothing is overwritten (ADR 020) — as a
 * draft, or published at once with cms.publish.
 */
export function VersionsScreen({ documentId, home = false }: { documentId?: string; home?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const canEdit = useCan("cms.update");
  const canPublish = useCan("cms.publish");
  const homeData = useAdminData<{ home: CmsDocument | null }>(home ? "/cms/home" : null);
  const id = home ? homeData.data?.home?.id : documentId;
  const document = useAdminData<CmsDocument>(id ? `/cms/documents/${id}` : null);
  const versions = useAdminData<CmsRevisionSummary[]>(id ? `/cms/documents/${id}/revisions` : null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [compare, setCompare] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const list = versions.data ?? [];
  const selected = list.find((version) => version.id === selectedId) ?? list.find((version) => !version.latest) ?? list[0];
  const revision = useAdminData<CmsRevision>(id && selected ? `/cms/documents/${id}/revisions/${selected.id}` : null);
  const backHref = home ? "/admin/home/manage" : `/admin/documentation/${documentId}`;
  const title = home ? "Home" : (document.data?.latest.title ?? "");

  async function act(label: string, path: string, body: object | undefined, done: string) {
    setBusy(label);
    setError(null);
    try {
      await adminApi(path, { method: "POST", body });
      toast(done);
      versions.reload();
      document.reload();
      setSelectedId(null);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof AdminApiError ? caught.message : "That didn't work.");
    } finally {
      setBusy(null);
    }
  }

  const loadError = homeData.error ?? document.error ?? versions.error;
  const current = document.data?.latest;
  const isCurrent = selected?.latest ?? false;

  return (
    <RecordLayout
      backHref={backHref}
      backLabel={title || "the page"}
      title={title ? `Versions · ${title}` : "Versions"}
      panel={
        <nav aria-label="Versions, newest first">
          <h2 className="flex h-10 items-center text-body font-bold">
            Versions <span className="ml-1 text-meta font-normal text-text-muted">{list.length || ""}</span>
          </h2>
          <ol className="border-t border-line">
            {list.map((version) => (
              <li key={version.id} className="border-b border-line">
                <button
                  type="button"
                  aria-current={version.id === selected?.id ? "true" : undefined}
                  onClick={() => setSelectedId(version.id)}
                  className={`flex w-full flex-col items-start gap-0.5 px-2 py-2 text-left hover:bg-surface-raised ${version.id === selected?.id ? "bg-surface-raised" : ""} ${focusRing}`}
                >
                  <span className="flex w-full items-center gap-2 text-meta">
                    <span className="font-bold text-text-primary">Version {version.number}</span>
                    {version.live ? <Badge>On the website</Badge> : null}
                    {version.latest && !version.live ? <Badge>{version.status === "draft" ? "Draft" : "Newest"}</Badge> : null}
                    <Timestamp value={version.createdAt} format="short" className="ml-auto shrink-0 text-text-muted" />
                  </span>
                  <span className="text-meta text-text-muted">
                    {version.author}
                    {version.restoredFrom ? ` · restores version ${version.restoredFrom}` : ""}
                  </span>
                  {version.summary ? <span className="text-meta text-text-primary">{version.summary}</span> : null}
                </button>
              </li>
            ))}
          </ol>
        </nav>
      }
    >
      {loadError ? <StatusMessage tone="error">{loadError.message}</StatusMessage> : null}
      {home && homeData.data && !homeData.data.home ? <StatusMessage>Home has no versions yet.</StatusMessage> : null}
      {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}
      {!selected || !revision.data || !current ? (
        id ? (
          <StatusMessage>Loading versions…</StatusMessage>
        ) : null
      ) : (
        <article aria-labelledby="version-heading" className="flex max-w-[656px] flex-col gap-3">
          <header className="flex flex-col gap-1">
            <h2 id="version-heading" className="text-body font-bold">
              Version {revision.data.number}
              {revision.data.title !== title && !home ? ` — ${revision.data.title}` : ""}
            </h2>
            <p className="text-meta text-text-muted">
              Saved by {revision.data.author}, <Timestamp value={revision.data.createdAt} format="full" />
              {revision.data.publishedAt ? (
                <>
                  {" "}
                  · published <Timestamp value={revision.data.publishedAt} format="full" />
                  {revision.data.publishedBy ? ` by ${revision.data.publishedBy}` : ""}
                </>
              ) : (
                " · never published"
              )}
            </p>
            {revision.data.expertise.length > 0 ? <p className="text-meta text-text-muted">Expertise: {revision.data.expertise.join(", ")}</p> : null}
          </header>
          <div className="flex flex-wrap gap-2">
            {isCurrent ? null : (
              <div role="group" aria-label="Show" className="flex gap-2">
                <AdminButton aria-pressed={compare} onClick={() => setCompare(true)}>
                  Compare with the current version
                </AdminButton>
                <AdminButton aria-pressed={!compare} onClick={() => setCompare(false)}>
                  This version only
                </AdminButton>
              </div>
            )}
            {canEdit && !isCurrent ? (
              <AdminButton
                icon="restart_alt"
                disabled={busy !== null}
                onClick={() =>
                  void act(
                    "restoring",
                    `/cms/documents/${id}/revisions/${selected.id}/restore`,
                    { publish: false },
                    `Version ${selected.number} restored as a draft`,
                  )
                }
              >
                {busy === "restoring" ? "Restoring…" : "Restore as a draft"}
              </AdminButton>
            ) : null}
            {canEdit && canPublish && !isCurrent ? (
              <AdminButton
                icon="check_circle"
                disabled={busy !== null}
                onClick={() =>
                  void act(
                    "restoring-live",
                    `/cms/documents/${id}/revisions/${selected.id}/restore`,
                    { publish: true },
                    `Version ${selected.number} restored and published`,
                  )
                }
              >
                {busy === "restoring-live" ? "Restoring…" : "Restore and publish"}
              </AdminButton>
            ) : null}
            {canPublish && isCurrent && !selected.live && document.data?.state !== "archived" ? (
              <AdminButton
                icon="check_circle"
                disabled={busy !== null}
                onClick={() => void act("publishing", `/cms/documents/${id}/publish`, { revisionId: selected.id }, `Version ${selected.number} published`)}
              >
                {busy === "publishing" ? "Publishing…" : "Publish this version"}
              </AdminButton>
            ) : null}
          </div>
          {compare && !isCurrent ? (
            <>
              <p className="text-meta text-text-muted">
                Compared with the current version ({current.number}): <span className="line-through">struck through</span> is in version {revision.data.number}{" "}
                only; marked + is in version {current.number} only.
              </p>
              <Comparison base={revision.data} next={current} />
            </>
          ) : (
            <DocumentationContent blocks={revision.data.content} imageSource="admin" />
          )}
        </article>
      )}
    </RecordLayout>
  );
}

function Badge({ children }: { children: string }) {
  return <span className="rounded-full px-2 text-meta text-text-primary ring-1 ring-line">{children}</span>;
}

/** The current version, with what the older one had and it doesn't (struck through) and what's new (marked +). */
function Comparison({ base, next }: { base: CmsRevision; next: CmsRevision }) {
  const rows = compareBlocks(base.content, next.content);
  if (rows.every((row) => row.change === "same")) return <StatusMessage>The content is the same as the current version.</StatusMessage>;
  return (
    <ol aria-label="Comparison" className="flex flex-col gap-2">
      {rows.map((row, index) => (
        <li
          key={index}
          data-compare={row.change}
          className={`flex gap-2 ${row.change === "removed" ? "text-text-muted line-through" : ""} ${row.change === "same" ? "opacity-70" : ""}`}
        >
          <span
            aria-label={row.change === "added" ? "Added" : row.change === "removed" ? "Removed" : undefined}
            className="w-3 shrink-0 text-meta text-text-muted"
          >
            {row.change === "added" ? "+" : row.change === "removed" ? "−" : ""}
          </span>
          <div className="min-w-0 flex-1">
            <DocumentationContent blocks={[row.block]} imageSource="admin" />
          </div>
        </li>
      ))}
    </ol>
  );
}
