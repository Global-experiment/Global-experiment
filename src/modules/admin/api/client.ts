"use client";

/**
 * Browser-side access to the native admin API. Always same-origin
 * `/api/admin/*` (proxied to NestJS — see src/shared/config/adminApi.ts):
 * the HttpOnly session cookie travels automatically and the browser's own
 * Origin header satisfies the API's CSRF check. No token ever lives in JS.
 */

import { loginHref } from "./paths";

export { loginHref, safeAdminNext } from "./paths";

export interface ValidationIssue {
  path: string;
  message: string;
}

export class AdminApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly issues: ValidationIssue[] = [],
  ) {
    super(message);
    this.name = "AdminApiError";
  }
}


type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export async function adminApi<T>(
  path: string,
  options: { method?: Method; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/admin${path}`, {
      method: options.method ?? "GET",
      headers: options.body === undefined ? { accept: "application/json" } : { accept: "application/json", "content-type": "application/json" },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      credentials: "same-origin",
      cache: "no-store",
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new AdminApiError(0, "network", "The admin API can't be reached. Check that it is running.");
  }

  if (response.status === 401 && typeof window !== "undefined" && !path.startsWith("/auth/")) {
    // Session ended (expired, revoked, logged out elsewhere): back to login, then here.
    window.location.assign(loginHref(window.location.pathname + window.location.search));
  }

  if (response.status === 204) return undefined as T;
  const body = (await response.json().catch(() => undefined)) as
    | { error?: { code?: string; message?: string; details?: { issues?: ValidationIssue[] } } }
    | undefined;

  if (!response.ok) {
    const error = body?.error;
    throw new AdminApiError(
      response.status,
      error?.code ?? (response.status >= 500 ? "internal" : "unknown"),
      error?.message ?? (response.status === 502 || response.status === 504 ? "The admin API can't be reached." : "Request failed."),
      error?.details?.issues ?? [],
    );
  }
  return body as T;
}
