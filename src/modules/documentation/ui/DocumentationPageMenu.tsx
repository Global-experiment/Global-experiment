"use client";

import { PageActionsMenu } from "@/shared/ui/PageActionsMenu";
import { ShareButton } from "@/shared/ui/ShareButton";

/**
 * Header controls shared by the Documentation index and article pages:
 * share, then the overflow sheet from figma.pdf p16 (share page, send
 * feedback, report issue) with its editorial note.
 */
export function DocumentationPageMenu({ url, title }: { url: string; title: string }) {
  return (
    <>
      <ShareButton url={url} title={title} />
      <PageActionsMenu
        title="Page actions"
        actions={[
          {
            label: "Share page",
            icon: "share",
            onClick: () => {
              void navigator.share?.({ url: new URL(url, window.location.origin).toString(), title }).catch(() => {});
            },
          },
          { label: "Send feedback", icon: "lightbulb", href: "/feedback" },
          { label: "Report issue", icon: "new_releases", href: "/issue" },
        ]}
      >
        This page is updated by the admin team. Please send feedback and reports if you see anything
        unclear or invalid.
      </PageActionsMenu>
    </>
  );
}
