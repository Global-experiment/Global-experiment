"use client";

import type { ReactNode } from "react";
import { PageActionsMenu } from "@/shared/ui/PageActionsMenu";
import { ShareButton, shareUrl } from "@/shared/ui/ShareButton";

/**
 * Header controls shared by the Documentation index and article pages:
 * share, then the overflow sheet — figma.pdf p16 (index: editorial note,
 * share page, send feedback, report issue) and p18 (article: last-updated
 * note, same rows). `historyHref` adds a "Document history" row on the
 * article page; Figma shows no entry point for p17, so this is the only way
 * to reach it.
 */
export function DocumentationPageMenu({
  url,
  title,
  historyHref,
  note,
}: {
  url: string;
  title: string;
  historyHref?: string;
  /** Lead copy above the rows; defaults to the index's editorial note (p16). */
  note?: ReactNode;
}) {
  return (
    <>
      <ShareButton url={url} title={title} />
      <PageActionsMenu
        label="Page actions"
        actions={[
          { label: "Share page", icon: "share", onClick: () => void shareUrl(url, title) },
          ...(historyHref ? [{ label: "Document history", icon: "history" as const, href: historyHref }] : []),
          { label: "Send feedback", icon: "lightbulb", href: "/feedback" },
          { label: "Report issue", icon: "new_releases", href: "/issue" },
        ]}
      >
        {note ?? (
          <p>
            This page is updated by admin team. Please send feedback and reports if you see anything
            unclear/invalid.
          </p>
        )}
      </PageActionsMenu>
    </>
  );
}
