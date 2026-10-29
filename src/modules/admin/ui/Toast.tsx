"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { focusRing } from "./controls";

/** A link the toast offers (e.g. "See the report" after an import). */
export interface ToastAction {
  href: string;
  label: string;
}

const ToastContext = createContext<(message: string, action?: ToastAction) => void>(() => {});

/** `const toast = useToast(); toast("People updated")`, or with a link: `toast("2 added", { href, label: "See the report" })`. */
export const useToast = () => useContext(ToastContext);

const VISIBLE_MS = 3000;
/** Long enough to reach the link. */
const WITH_ACTION_MS = 8000;

/**
 * Figma's confirmation toast (p40–p43: "Notion imported 34 new entries",
 * "Filters applied", "People updated"): a 34px #1f1f1f pill, bold 14px
 * white text, 12px side padding, 24px above the bottom edge, centered on
 * the content area (right of the sidebar, 240px or the 56px rail). Announced politely.
 */
export function ToastProvider({ sidebarWidth = 240, children }: { sidebarWidth?: number; children: ReactNode }) {
  const [toast, setToast] = useState<{ id: number; message: string; action?: ToastAction } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const show = useCallback((message: string, action?: ToastAction) => {
    clearTimeout(timer.current);
    setToast({ id: Date.now(), message, action });
    timer.current = setTimeout(() => setToast(null), action ? WITH_ACTION_MS : VISIBLE_MS);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        role="status"
        aria-live="polite"
        data-admin-toast
        style={{ left: `calc(${sidebarWidth / 2}px + 50vw)` }}
        className="pointer-events-none fixed bottom-6 z-50 -translate-x-1/2"
      >
        {toast ? (
          <p
            key={toast.id}
            className={`flex h-[34px] items-center gap-3 rounded-full bg-surface-raised px-3 text-body font-bold whitespace-nowrap text-text-primary ${toast.action ? "pointer-events-auto" : ""}`}
          >
            {toast.message}
            {toast.action ? (
              <Link href={toast.action.href} className={`font-normal underline underline-offset-2 ${focusRing}`}>
                {toast.action.label}
              </Link>
            ) : null}
          </p>
        ) : null}
      </div>
    </ToastContext.Provider>
  );
}
