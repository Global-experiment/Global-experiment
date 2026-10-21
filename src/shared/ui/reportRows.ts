import type { IconName } from "./icons";

/** A row of a page's ⋮ menu (see PageActionsMenu). Plain data: server pages build these too. */
export interface PageAction {
  label: string;
  icon: IconName;
  href?: string;
  onClick?: () => void;
  /** A copy/share row ("Share page"): copies on desktop (check icon, toast, then the sheet closes), native share on mobile. */
  share?: { url: string; title?: string };
}

/** The two rows every public menu has (client review 2026-10-21): they open the existing forms with this page as context. */
export const REPORT_ROWS: readonly PageAction[] = [
  { label: "Send feedback", icon: "lightbulb", href: "/feedback" },
  { label: "Report issue", icon: "new_releases", href: "/issue" },
];

/** The page's rows as given, plus Send feedback and Report issue at the end when the page doesn't list them. */
export function withReportRows(actions: readonly PageAction[]): PageAction[] {
  const missing = REPORT_ROWS.filter((row) => !actions.some((action) => action.href === row.href));
  return [...actions, ...missing];
}
