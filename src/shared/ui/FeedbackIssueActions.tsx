"use client";

import { ReportLaunchButton } from "@/shared/report/ReportLauncher";

/**
 * The two compact (32px) outlined actions that close every article/detail
 * body in the Figma reference (figma.pdf p15, and the same pattern on
 * Treasury's expense detail): Send feedback (lightbulb) and Report issue
 * (new_releases). Each opens its qualification sheet over this page and
 * carries the page as the report's source (client: the admin needs that
 * context) — the current page by default, or an explicit one (e.g. a
 * specific Documentation article anchor).
 */
export function FeedbackIssueActions({ className = "", source }: { className?: string; source?: string }) {
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      <ReportLaunchButton kind="feedback" source={source} size="compact" icon="lightbulb">
        Send feedback
      </ReportLaunchButton>
      <ReportLaunchButton kind="issue" source={source} size="compact" icon="new_releases">
        Report issue
      </ReportLaunchButton>
    </div>
  );
}
