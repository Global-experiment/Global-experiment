import { Button } from "@/shared/ui/Button";
import { Icon } from "@/shared/ui/icons";

/**
 * The two compact (32px) outlined actions that close every article body in
 * figma.pdf p15: Send feedback (lightbulb) and Report issue (new_releases).
 * They navigate to the existing route shells; nothing is submitted here.
 */
export function ArticleActions({ className = "" }: { className?: string }) {
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
