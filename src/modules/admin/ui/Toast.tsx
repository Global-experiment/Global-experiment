"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

const ToastContext = createContext<(message: string) => void>(() => {});

/** `const toast = useToast(); toast("People updated")` */
export const useToast = () => useContext(ToastContext);

const VISIBLE_MS = 3000;

/**
 * Figma's confirmation toast (p40–p43: "Notion imported 34 new entries",
 * "Filters applied", "People updated"): a 34px #1f1f1f pill, bold 14px
 * white text, 12px side padding, 24px above the bottom edge, centered on
 * the content area (right of the 240px sidebar). Announced politely.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const show = useCallback((message: string) => {
    clearTimeout(timer.current);
    setToast({ id: Date.now(), message });
    timer.current = setTimeout(() => setToast(null), VISIBLE_MS);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div role="status" aria-live="polite" className="pointer-events-none fixed bottom-6 left-[calc(120px+50vw)] z-50 -translate-x-1/2">
        {toast ? (
          <p
            key={toast.id}
            className="flex h-[34px] items-center rounded-full bg-surface-raised px-3 text-body font-bold whitespace-nowrap text-text-primary"
          >
            {toast.message}
          </p>
        ) : null}
      </div>
    </ToastContext.Provider>
  );
}
