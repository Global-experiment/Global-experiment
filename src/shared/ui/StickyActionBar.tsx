"use client";

import type { ReactNode } from "react";
import { Container } from "./Container";
import { useKeyboardInset } from "./useKeyboardInset";

/**
 * Bottom-fixed CTA bar: 8px above and below the 40px control, black
 * background, no rule (figma.pdf p1/p33 — the bar simply covers content
 * scrolling beneath it). Pages that render it add `pb-16` to <main> so the
 * last content line is never hidden. The bottom padding grows with the
 * device safe area (home indicator) so the CTA stays tappable.
 *
 * When a software keyboard is open, `bottom` is pushed up by exactly the
 * covered height (client feedback item 11) instead of staying pinned to
 * the window edge, where the keyboard would hide it. Waitlist doesn't use
 * this component — its CTA sits inline under the email field instead
 * (client feedback item 29). Home passes `md:hidden` (and `md:pb-6` on its
 * <main>) so the bar exists on mobile only, with no space reserved on
 * desktop.
 */
export function StickyActionBar({ children, className = "" }: { children: ReactNode; className?: string }) {
  const inset = useKeyboardInset();

  return (
    <div
      className={`fixed inset-x-0 bottom-0 bg-surface-base pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] ${className}`}
      style={inset > 0 ? { bottom: inset, paddingBottom: "0.5rem" } : undefined}
    >
      <Container>{children}</Container>
    </div>
  );
}
