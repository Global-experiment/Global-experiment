"use client";

import { useEffect, useState } from "react";

/**
 * Pure calculation, exported separately so it's unit-testable without a
 * real `visualViewport` (client feedback item 11/38). `layoutHeight` is the
 * window's full layout-viewport height; `visualHeight`/`visualOffsetTop`
 * come from `window.visualViewport`. The result is how much of the bottom
 * of the layout viewport is currently covered (by an on-screen keyboard,
 * mainly) — 0 when nothing is covering it.
 *
 * Only a software keyboard should lift the bar, and a keyboard only exists
 * while a text field has focus: when `editableFocused` is false the inset
 * is 0, so the transient viewport differences mobile browsers report while
 * their own toolbars collapse/expand on scroll can't move the bar (Review #3
 * item 4 — the fixed bar already follows the visible bottom by itself).
 */
export function computeKeyboardInset(
  layoutHeight: number,
  visualHeight: number,
  visualOffsetTop: number,
  editableFocused = true,
): number {
  if (!editableFocused) return 0;
  const covered = layoutHeight - visualHeight - visualOffsetTop;
  return covered > 1 ? Math.round(covered) : 0;
}

const NON_TEXT_INPUTS = new Set(["button", "checkbox", "color", "file", "hidden", "image", "radio", "range", "reset", "submit"]);

/** Whether focusing this element brings up a software keyboard. */
export function isTextEntry(element: Element | null): boolean {
  if (!element) return false;
  if (element instanceof HTMLTextAreaElement) return !element.readOnly;
  if (element instanceof HTMLInputElement) return !element.readOnly && !NON_TEXT_INPUTS.has(element.type);
  return element instanceof HTMLElement && element.isContentEditable;
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
      setInset(
        computeKeyboardInset(window.innerHeight, viewport.height, viewport.offsetTop, isTextEntry(document.activeElement)),
      );
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
      [document, "focusin"],
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
