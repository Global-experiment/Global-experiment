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

    function update() {
      // vv is narrowed to non-null by the enclosing closure over the
      // local `vv` captured above (TypeScript can't see that across the
      // event-listener boundary without this local alias).
      const viewport = window.visualViewport;
      if (!viewport) return;
      setInset(computeKeyboardInset(window.innerHeight, viewport.height, viewport.offsetTop));
    }

    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  return inset;
}
