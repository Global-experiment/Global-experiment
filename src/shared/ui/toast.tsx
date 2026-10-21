"use client";

import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from "react";

const VISIBLE_MS = 3000;

let current: { id: number; message: string } | null = null;
let nextId = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

/**
 * Shows the public site's toast ("Link copied to clipboard", …) for a few
 * seconds. A new toast replaces the one on screen. Safe to call from any
 * client component; ToastHost (in the public layout) renders it.
 */
export function showToast(message: string): void {
  current = { id: ++nextId, message };
  clearTimeout(timer);
  timer = setTimeout(() => {
    current = null;
    emit();
  }, VISIBLE_MS);
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Gap between the toast and whatever sits at the bottom (a sticky action bar, an open sheet), or the window edge. */
const GAP_REM = 0.5;
const EDGE_REM = 1.5;

/** Bottom elements the toast must clear: sticky action bars and open bottom sheets. */
const BOTTOM_LAYERS = "[data-action-bar], dialog.sheet[open]";

/** How far from the bottom of the window the toast sits, in px: above the highest bottom element. */
export function toastBottomOffset(doc: Document = document): number {
  const rem = Number.parseFloat(getComputedStyle(doc.documentElement).fontSize) || 16;
  let covered = 0;
  for (const element of doc.querySelectorAll<HTMLElement>(BOTTOM_LAYERS)) {
    const rect = element.getBoundingClientRect();
    if (rect.height === 0 || rect.top >= innerHeight) continue;
    // Only what reaches the bottom edge (a sheet pinned to the bottom, a fixed bar), not a centred desktop dialog.
    if (innerHeight - rect.bottom > 1) continue;
    covered = Math.max(covered, innerHeight - rect.top);
  }
  return covered > 0 ? covered + GAP_REM * rem : EDGE_REM * rem;
}

/**
 * Common pages p34 toast: a 34px pill, bold 14px text, 12px side padding,
 * centred near the bottom (the same toast as "Donation sent" and the
 * admin's). One shared layer for every page (client review 2026-10-21): a
 * manual popover, so it is drawn in the top layer above sticky bars, open
 * sheets and dialogs, and placed just above the highest bottom element (or
 * 1.5rem from the edge). Announced politely; the live region stays mounted
 * so screen readers hear every new message.
 */
export function ToastHost() {
  const toast = useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
  const layer = useRef<HTMLDivElement>(null);
  useEffect(() => () => clearTimeout(timer), []);
  // Open (and empty) from the start, so the live region is in the accessibility tree before the first message.
  useEffect(() => {
    const element = layer.current;
    if (element && typeof element.showPopover === "function" && !element.matches(":popover-open")) element.showPopover();
  }, []);

  useLayoutEffect(() => {
    const element = layer.current;
    if (!element || !toast) return;
    const place = () => {
      element.style.bottom = `${toastBottomOffset()}px`;
    };
    place();
    if (typeof element.showPopover === "function") {
      // Re-showing moves the layer above anything opened since (a sheet that is still open).
      if (element.matches(":popover-open")) element.hidePopover();
      element.showPopover();
    }
    // Follows the bottom elements while the toast is up: a sheet sliding down, the keyboard resizing the window.
    const observer = new ResizeObserver(place);
    for (const bottom of document.querySelectorAll(BOTTOM_LAYERS)) observer.observe(bottom);
    addEventListener("resize", place);
    const frames = setInterval(place, 100);
    return () => {
      observer.disconnect();
      removeEventListener("resize", place);
      clearInterval(frames);
    };
  }, [toast]);

  return (
    <div
      ref={layer}
      popover="manual"
      role="status"
      aria-live="polite"
      data-toast-layer
      className="pointer-events-none fixed inset-x-0 top-auto z-50 m-0 ml-(--scrollbar-offset) flex w-auto justify-center overflow-visible border-0 bg-transparent p-0 text-inherit"
    >
      {toast ? (
        <p key={toast.id} data-toast className="flex h-[2.125rem] items-center rounded-full bg-surface-raised px-3 text-body font-bold whitespace-nowrap text-text-primary">
          {toast.message}
        </p>
      ) : null}
    </div>
  );
}
