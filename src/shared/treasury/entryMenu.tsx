import type { PageAction } from "@/shared/ui/reportRows";
import { TREASURY_COPY } from "./copy";

/**
 * An entry's ⋮ menu (Common pages p23, p27), for the shared header: the
 * sentence describing the entry, then Donate, Share page, Send feedback,
 * Report issue, Documentation, and Treasury (the chart link that used to sit
 * in the header; client review 2026-10-21). p23's "Roadmap" row waits for the
 * roadmap module: no entry is linked to a roadmap item yet.
 */
export function entryMenu({ sentence, url, title }: { sentence: string; url: string; title: string }) {
  const menu = TREASURY_COPY.menu;
  const actions: PageAction[] = [
    { label: menu.donate, icon: "volunteer_activism", href: "/donate" },
    { label: menu.share, icon: "share", share: { url, title } },
    { label: menu.feedback, icon: "lightbulb", href: "/feedback" },
    { label: menu.issue, icon: "new_releases", href: "/issue" },
    { label: menu.documentation, icon: "insert_drive_file", href: "/documentation" },
    { label: TREASURY_COPY.header.treasuryLink, icon: "leaderboard", href: "/treasury" },
  ];
  return { label: TREASURY_COPY.header.pageActions, actions, note: <p>{sentence}</p> };
}
