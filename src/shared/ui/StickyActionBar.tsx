"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Container } from "./Container";
import { useKeyboardInset } from "./useKeyboardInset";

/**
 * Bottom CTA bar: 8px above and below the 40px control, black background,
 * no rule (figma.pdf p1/p33 — the bar simply covers content scrolling
 * beneath it). The bottom padding grows with the device safe area (home
 * indicator) so the CTA stays tappable.
 *
 * `position: fixed` to the bottom of the visible viewport (Review #3 item
 * 4). It used to be `position: sticky`, which pins to the bottom of the
 * root scrollport — on mobile Safari/Chrome with a collapsing toolbar that
 * edge isn't the visible bottom, so on Home the bar could sit under the
 * browser's footer; it only behaved with the keyboard open, because its
 * `bottom` then came from the VisualViewport. A fixed bar is moved by the
 * browser itself as its toolbars show/hide, with no script in the loop.
 *
 * Content can't hide behind it: an in-flow spacer reserves the bar's
 * height — exact CSS for the standard bar before hydration (8px + 40px +
 * max(8px, safe area)), then the measured height (enlarged text, a wrapped
 * label). The spacer keeps `mt-auto`, so short pages still end where the
 * bar sits.
 *
 * With a software keyboard open, `bottom` rises by exactly the covered
 * height (client feedback item 11; on Android `interactive-widget=
 * resizes-content` already shrinks the viewport, so that inset is 0).
 * Waitlist doesn't use this component — its CTA sits inline under the email
 * field (client feedback item 29). Home passes `md:hidden`: mobile only,
 * with no space reserved on desktop.
 */
export function StickyActionBar({ children, className = "" }: { children: ReactNode; className?: string }) {
  const inset = useKeyboardInset();
  const barRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);

  useLayoutEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    // Measured without the keyboard lift, so the spacer doesn't change while typing.
    const observer = new ResizeObserver(([entry]) => {
      if (entry && inset === 0) setHeight(entry.borderBoxSize[0]?.blockSize ?? bar.offsetHeight);
    });
    observer.observe(bar);
    return () => observer.disconnect();
  }, [inset]);

  return (
    <>
      <div
        aria-hidden="true"
        data-action-bar-spacer
        className={`mt-auto h-[calc(3rem+max(0.5rem,env(safe-area-inset-bottom)))] shrink-0 ${className}`}
        style={height ? { height } : undefined}
      />
      <div
        ref={barRef}
        data-action-bar
        className={`fixed inset-x-0 bottom-0 z-20 bg-surface-base pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] ${className}`}
        style={inset > 0 ? { bottom: inset, paddingBottom: "0.5rem" } : undefined}
      >
        <Container>{children}</Container>
      </div>
    </>
  );
}
