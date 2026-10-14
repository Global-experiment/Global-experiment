"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { parsePrefs, type ColumnPrefs } from "./columnPrefs";

const CHANGE_EVENT = "ge-admin-column-prefs";

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Column preferences persisted per browser, read without a hydration mismatch (server snapshot = defaults). */
export function useColumnPrefs(tableId: string, knownIds: readonly string[], defaultHidden: readonly string[] = []) {
  const key = `ge-admin-columns:${tableId}`;
  const subscribe = useCallback((onChange: () => void) => {
    window.addEventListener("storage", onChange);
    window.addEventListener(CHANGE_EVENT, onChange);
    return () => {
      window.removeEventListener("storage", onChange);
      window.removeEventListener(CHANGE_EVENT, onChange);
    };
  }, []);
  const raw = useSyncExternalStore(subscribe, () => read(key), () => null);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- knownIds is a static column list
  const prefs = useMemo(() => parsePrefs(raw, knownIds, defaultHidden), [raw]);

  const setPrefs = useCallback(
    (next: ColumnPrefs) => {
      try {
        // `seen`: the columns that exist now, so a later optional column still starts hidden.
        window.localStorage.setItem(key, JSON.stringify({ ...next, seen: [...knownIds] }));
      } catch {
        // Storage unavailable (private mode / blocked): preferences just don't persist.
      }
      window.dispatchEvent(new Event(CHANGE_EVENT));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- knownIds is a static column list
    [key],
  );

  return [prefs, setPrefs] as const;
}
