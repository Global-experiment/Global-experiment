"use client";

import { useEffect, useState } from "react";

/**
 * Pure calculation, exported separately so it's unit-testable without a
 * real `visualViewport` (client feedback item 11/38). `layoutHeight` is the
 * window's full layout-viewport height; `visualHeight`/`visualOffsetTop`
 * come from `window.visualViewport`. The result is how much of the bottom
 * of the layout viewport is currently covered (by an on-screen keyboard,
 * mainly) — 0 when nothing is covering it.
 */
export function computeKeyboardInset(
  layoutHeight: number,
  visualHeight: number,
  visualOffsetTop: number,
): number {
  const covered = layoutHeight - visualHeight - visualOffsetTop;
  return covered > 1 ? Math.round(covered) : 0;
}

/**
 * Tracks how much the on-screen keyboard currently covers the bottom of
 * the viewport, using the VisualViewport API (client feedback item 11).
 * Returns 0 — a safe no-op — when the API is unavailable (older browsers,
 * desktop): callers fall back to their normal fixed-to-bottom position,
 * matching the existing safe-area handling.
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    let frame = 0;

    function measure() {
      frame = 0;
      const viewport = window.visualViewport;
      if (!viewport) return;
      // Same value → React bails out, so steady scrolling doesn't re-render.
      setInset(computeKeyboardInset(window.innerHeight, viewport.height, viewport.offsetTop));
    }

    // Coalesced to one read per frame. Besides the viewport's own events,
    // window resize/orientationchange and focusout (keyboard dismissed)
    // re-measure too, so no stale inset survives a rotation or a closed
    // keyboard on browsers that report those late.
    function update() {
      if (!frame) frame = requestAnimationFrame(measure);
    }

    measure();
    const targets: [EventTarget, string][] = [
      [vv, "resize"],
      [vv, "scroll"],
      [window, "resize"],
      [window, "orientationchange"],
      [document, "focusout"],
    ];
    for (const [target, type] of targets) target.addEventListener(type, update);
    return () => {
      for (const [target, type] of targets) target.removeEventListener(type, update);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return inset;
}
