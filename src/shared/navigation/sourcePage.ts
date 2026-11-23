import { sanitizeSourcePage } from "./sourcePageRule";

/**
 * Where a visitor opened Send feedback / Report issue from, carried as
 * `?source=<internal path>` and validated on both ends (the rule itself is
 * sourcePageRule.ts, shared with the API).
 */

export { sanitizeSourcePage };
export type ReportKind = "feedback" | "issue";

/** `/feedback?source=…` / `/issue?source=…` for a given current page. */
export function reportHref(kind: ReportKind, source: string | null | undefined): string {
  const base = `/${kind}`;
  const safe = sanitizeSourcePage(source);
  return safe ? `${base}?source=${encodeURIComponent(safe)}` : base;
}

/** Reads and validates `source` from a query string (e.g. `location.search`). */
export function sourcePageFromSearch(search: string): string | null {
  return sanitizeSourcePage(new URLSearchParams(search).get("source"));
}
