import type { ReactNode } from "react";
import type { PageAction } from "@/shared/ui/reportRows";

/**
 * The ⋮ menu of the Documentation index and article pages, for the shared
 * header (NavHeader): figma.pdf p16 (index: editorial note, share page, send
 * feedback, report issue) and p18 (article: last-updated note, same rows).
 * `historyHref` adds a "Document history" row on the article page; Figma
 * shows no entry point for p17, so this is the only way to reach it.
 */
export function documentationMenu({
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
}): { actions: PageAction[]; note: ReactNode } {
  return {
    actions: [
      { label: "Share page", icon: "share", share: { url, title } },
      ...(historyHref ? [{ label: "Document history", icon: "history" as const, href: historyHref }] : []),
      { label: "Send feedback", icon: "lightbulb", href: "/feedback" },
      { label: "Report issue", icon: "new_releases", href: "/issue" },
    ],
    note: note ?? <p>This page is updated by admin team. Please send feedback and reports if you see anything unclear/invalid.</p>,
  };
}
