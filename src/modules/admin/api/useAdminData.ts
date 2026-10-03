"use client";

import { useCallback, useEffect, useState } from "react";
import { adminApi, AdminApiError } from "./client";

type State<T> = { key: string; data?: T; error?: AdminApiError };

/**
 * GET an admin resource; re-fetches when `path` changes or `reload()` is
 * called. Loading is derived (no synchronous state writes in effects).
 */
export function useAdminData<T>(path: string | null) {
  const [token, setToken] = useState(0);
  const [state, setState] = useState<State<T>>({ key: "" });
  const key = path === null ? "" : `${path}#${token}`;

  useEffect(() => {
    if (path === null) return;
    const controller = new AbortController();
    adminApi<T>(path, { signal: controller.signal }).then(
      (data) => setState({ key, data }),
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setState({ key, error: error instanceof AdminApiError ? error : new AdminApiError(0, "unknown", "Something went wrong.") });
      },
    );
    return () => controller.abort();
  }, [path, key]);

  const reload = useCallback(() => setToken((value) => value + 1), []);
  const current = state.key === key;
  return {
    data: state.data,
    error: current ? state.error : undefined,
    loading: path !== null && !current,
    reload,
  };
}
