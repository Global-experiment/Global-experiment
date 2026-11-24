/**
 * Where a visitor opened Send feedback / Report issue from (client: the admin needs that context), kept only as a
 * same-site application path: never an external URL, protocol-relative URL or script scheme. ONE file, kept in two
 * places because the API and the website build separately: src/shared/navigation/sourcePageRule.ts and
 * apps/api/src/common/source-page-rule.ts. A test (sourcePageRule.test.ts) fails if the two copies differ by a
 * single character: edit one, copy it over the other. No imports.
 */

const INTERNAL_BASE = "https://internal.invalid";
const MAX_LENGTH = 300;
const REPORT_PATHS = new Set(["/feedback", "/issue"]);

/** The validated internal path (pathname + query + hash), or null. */
export function sanitizeSourcePage(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (!value || value.length > MAX_LENGTH) return null;
  // Must be root-relative: "/x", never "//host", "\host", "http:", "javascript:"…
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
  const path = `${url.pathname}${url.search}${url.hash}`;
  // Normalising can lengthen it ("é" → "%C3%A9"): the result keeps the limit too.
  return path.length > MAX_LENGTH ? null : path;
}
