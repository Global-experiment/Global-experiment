"use client";

import { PageActionsMenu } from "@/shared/ui/PageActionsMenu";
import { shareUrl } from "@/shared/ui/ShareButton";
import { TREASURY_COPY } from "./copy";

/**
 * An entry's page actions (Common pages p23, p27): the sentence describing
 * the entry, then Donate, Share page, Send feedback, Report issue,
 * Documentation. (p23's "Roadmap" row waits for the roadmap module: no
 * entry is linked to a roadmap item yet.)
 */
export function EntryActionsMenu({ sentence, url, title }: { sentence: string; url: string; title: string }) {
  const menu = TREASURY_COPY.menu;
  return (
    <PageActionsMenu
      label={TREASURY_COPY.header.pageActions}
      actions={[
        { label: menu.donate, icon: "volunteer_activism", href: "/donate" },
        { label: menu.share, icon: "share", onClick: () => void shareUrl(url, title) },
        { label: menu.feedback, icon: "lightbulb", href: "/feedback" },
        { label: menu.issue, icon: "new_releases", href: "/issue" },
        { label: menu.documentation, icon: "insert_drive_file", href: "/documentation" },
      ]}
    >
      <p>{sentence}</p>
    </PageActionsMenu>
  );
}
