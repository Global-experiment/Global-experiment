"use client";

import type { ReactNode } from "react";
import { Container } from "./Container";
import { useKeyboardInset } from "./useKeyboardInset";

/**
 * Bottom CTA bar: 8px above and below the 40px control, black background,
 * no rule (figma.pdf p1/p33 — the bar simply covers content scrolling
 * beneath it). The bottom padding grows with the device safe area (home
 * indicator) so the CTA stays tappable.
 *
 * `position: sticky` as the last child of <main> (pushed down with
 * `mt-auto` on short pages), not `position: fixed`: the bar stays in the
 * page flow, so the end of the page always clears its *actual* rendered
 * height — including the safe-area inset, enlarged text, or a wrapped
 * label — with no per-page padding guess to keep in sync.
 *
 * When a software keyboard is open, `bottom` is pushed up by exactly the
 * covered height (client feedback item 11) so the keyboard doesn't hide
 * it. Waitlist doesn't use this component — its CTA sits inline under the
 * email field instead (client feedback item 29). Home passes `md:hidden`
 * so the bar exists on mobile only, with no space reserved on desktop.
 */
export function StickyActionBar({ children, className = "" }: { children: ReactNode; className?: string }) {
  const inset = useKeyboardInset();

  return (
    <div
      className={`sticky bottom-0 mt-auto bg-surface-base pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] ${className}`}
      style={inset > 0 ? { bottom: inset, paddingBottom: "0.5rem" } : undefined}
    >
      <Container>{children}</Container>
    </div>
  );
}
