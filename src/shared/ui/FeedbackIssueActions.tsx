import { Button } from "./Button";
import { Icon } from "./icons";

/**
 * The two compact (32px) outlined actions that close every article/detail
 * body in the Figma reference (figma.pdf p15, and the same pattern on
 * Treasury's expense detail): Send feedback (lightbulb) and Report issue
 * (new_releases). They navigate to the existing route shells; nothing is
 * submitted here. Shared across the Documentation and Treasury modules.
 */
export function FeedbackIssueActions({ className = "" }: { className?: string }) {
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      <Button href="/feedback" size="compact" icon={<Icon name="lightbulb" />}>
        Send feedback
      </Button>
      <Button href="/issue" size="compact" icon={<Icon name="new_releases" />}>
        Report issue
      </Button>
    </div>
  );
}
