const SITE_HOSTS = new Set(["globalexperiment.org", "www.globalexperiment.org"]);

// Only documentation routes are normalized: they are the only internal
// destinations editors link to, and are known to exist in every
// environment. Anything else on the production domain stays as written.
const DOCUMENTATION_PATH = /^\/documentation(\/[a-z0-9][a-z0-9-]*)?\/?$/;

/**
 * Rewrites absolute links to this site's own documentation
 * (https://globalexperiment.org/documentation/<slug>) into internal
 * application routes, so they work on localhost/staging instead of sending
 * reviewers to the production domain. External URLs and mailto: links are
 * returned untouched.
 */
export function normalizeInternalLink(href: string): string {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return href; // relative or malformed — leave as written
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") return href;
  if (!SITE_HOSTS.has(url.hostname.toLowerCase())) return href;
  if (!DOCUMENTATION_PATH.test(url.pathname)) return href;

  const path = url.pathname.length > 1 ? url.pathname.replace(/\/$/, "") : url.pathname;
  return `${path}${url.search}${url.hash}`;
}

export function isInternalHref(href: string): boolean {
  return href.startsWith("/") && !href.startsWith("//");
}
