import type { ReactNode } from "react";
import { Container } from "./Container";

/**
 * Bottom-fixed CTA bar: 8px above and below the 40px control, black
 * background, no rule (figma.pdf p1/p33 — the bar simply covers content
 * scrolling beneath it). Pages that render it add `pb-16` to <main> so the
 * last content line is never hidden. The bottom padding grows with the
 * device safe area (home indicator) so the CTA stays tappable.
 */
export function StickyActionBar({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 bg-surface-base pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      <Container>{children}</Container>
    </div>
  );
}
