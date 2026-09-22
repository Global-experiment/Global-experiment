"use client";

import { useSyncExternalStore } from "react";
import { Icon } from "./icons";

const STORAGE_KEY = "ge-theme";
type Theme = "dark" | "light";

// A tiny store around the `data-theme` DOM attribute rather than React
// state: the real value lives on `document.documentElement` (read
// synchronously by the inline script in layout.tsx before paint) and isn't
// knowable during SSR. `useSyncExternalStore`'s server snapshot is exactly
// for this — it renders the SSR-safe default ("dark") on the first client
// render and only switches to the real value after hydration, with no
// manual effect/setState dance (and no hydration-mismatch warning).
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): Theme {
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

function getServerSnapshot(): Theme {
  return "dark";
}

function setTheme(theme: Theme) {
  if (theme === "light") document.documentElement.setAttribute("data-theme", "light");
  else document.documentElement.removeAttribute("data-theme");
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Private browsing / storage disabled — the toggle still works for
    // this page view, it just won't persist across visits.
  }
  for (const listener of listeners) listener();
}

/**
 * TEMPORARY, review-only theme switch (client feedback item 7). Dark stays
 * the permanent default and the only theme with no explicit choice stored;
 * light is a preview. Persisted to localStorage only — no server/database
 * involvement — and read synchronously before paint by the inline script
 * in layout.tsx (THEME_INIT_SCRIPT) so there's no flash of the wrong theme
 * on load.
 *
 * Deliberately isolated: this file, the matching lines in layout.tsx, and
 * the `[data-theme="light"]` block in globals.css are the entire feature —
 * removing all three removes it cleanly.
 */
export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return (
    <button
      type="button"
      onClick={() => setTheme(theme === "light" ? "dark" : "light")}
      aria-pressed={theme === "light"}
      className="inline-flex size-10 shrink-0 items-center justify-center rounded-control text-text-primary hover:ring-1 hover:ring-content-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary"
    >
      <Icon name={theme === "light" ? "dark_mode" : "light_mode"} size={20} />
      <span className="sr-only">{theme === "light" ? "Switch to dark preview" : "Switch to light preview"}</span>
    </button>
  );
}
