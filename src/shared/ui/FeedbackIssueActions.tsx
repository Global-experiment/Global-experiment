"use client";

import { reportHref } from "@/shared/navigation/sourcePage";
import { useCurrentSourcePage } from "@/shared/navigation/useCurrentSourcePage";
import { Button } from "./Button";

/**
 * The two compact (32px) outlined actions that close every article/detail
 * body in the Figma reference (figma.pdf p15, and the same pattern on
 * Treasury's expense detail): Send feedback (lightbulb) and Report issue
 * (new_releases). Both carry the page they were opened from as `?source=`
 * (client: the admin needs that context) — the current page by default, or
 * an explicit one (e.g. a specific Documentation article anchor).
 */
export function FeedbackIssueActions({ className = "", source }: { className?: string; source?: string }) {
  const current = useCurrentSourcePage();
  const from = source ?? current;
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      <Button href={reportHref("feedback", from)} size="compact" icon="lightbulb">
        Send feedback
      </Button>
      <Button href={reportHref("issue", from)} size="compact" icon="new_releases">
        Report issue
      </Button>
    </div>
  );
}
