/**
 * Where a visitor opened Send feedback / Report issue from (client: the
 * future admin needs that context). Carried as `?source=<internal path>`
 * and validated on both ends: only same-site application paths are kept —
 * never an external URL, protocol-relative URL or script scheme.
 */

const INTERNAL_BASE = "https://internal.invalid";
const MAX_LENGTH = 300;
export type ReportKind = "feedback" | "issue";
const REPORT_PATHS = new Set(["/feedback", "/issue"]);

/** The validated internal path (pathname + query + hash), or null. */
export function sanitizeSourcePage(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (!value || value.length > MAX_LENGTH) return null;
  // Must be root-relative: "/x", never "//host", "\\host", "http:", "javascript:"…
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return null;
  if (/[\u0000-\u001f\u007f]/.test(value)) return null;

  let url: URL;
  try {
    url = new URL(value, INTERNAL_BASE);
  } catch {
    return null;
  }
  if (url.origin !== INTERNAL_BASE) return null;
  // A report page can't be its own source.
  if (REPORT_PATHS.has(url.pathname)) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}

/** `/feedback?source=…` / `/issue?source=…` for a given current page. */
export function reportHref(kind: ReportKind, source: string | null | undefined): string {
  const base = `/${kind}`;
  const safe = sanitizeSourcePage(source);
  return safe ? `${base}?source=${encodeURIComponent(safe)}` : base;
}

/** Rewrites a plain "/feedback" or "/issue" href to carry the source; other hrefs pass through. */
export function withReportSource(href: string, source: string | null | undefined): string {
  if (href === "/feedback") return reportHref("feedback", source);
  if (href === "/issue") return reportHref("issue", source);
  return href;
}

/** Reads and validates `source` from a query string (e.g. `location.search`). */
export function sourcePageFromSearch(search: string): string | null {
  return sanitizeSourcePage(new URLSearchParams(search).get("source"));
}
