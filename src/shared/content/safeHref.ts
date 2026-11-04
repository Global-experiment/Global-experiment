/**
 * Whether a link from the content may be rendered as a link: `https://…`,
 * `http://…`, `mailto:…`, a path of this site or an anchor. The API refuses
 * anything else when content is saved (apps/api/src/cms/content.ts); this is
 * the same rule again where links are rendered, so a bad value could never
 * become a `javascript:` link even if it reached the page.
 */
export function isSafeHref(href: string): boolean {
  if (href.length === 0 || href.length > 2000) return false;
  if (/[\s\u0000-\u001f\u007f\\]/.test(href)) return false;
  if (href.startsWith("#")) return href.length > 1;
  if (href.startsWith("/")) return !href.startsWith("//");
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return false;
  }
  if (url.protocol === "mailto:") return url.pathname.includes("@");
  return (url.protocol === "https:" || url.protocol === "http:") && url.hostname.length > 0;
}
