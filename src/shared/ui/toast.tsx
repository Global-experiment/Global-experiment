"use client";

import { useEffect, useSyncExternalStore } from "react";

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

/**
 * Common pages p34 toast: a 34px pill, bold 14px text, 12px side padding,
 * centred near the bottom (the same toast as "Donation sent" and the
 * admin's). Announced politely; the live region stays mounted so screen
 * readers hear every new message.
 */
export function ToastHost() {
  const toast = useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
  useEffect(() => () => clearTimeout(timer), []);

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[max(4.5rem,calc(env(safe-area-inset-bottom)+4rem))] z-50 ml-(--scrollbar-offset) flex justify-center md:bottom-6"
    >
      {toast ? (
        <p key={toast.id} data-toast className="flex h-[34px] items-center rounded-full bg-surface-raised px-3 text-body font-bold whitespace-nowrap text-text-primary">
          {toast.message}
        </p>
      ) : null}
    </div>
  );
}
