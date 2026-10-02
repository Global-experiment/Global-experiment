/**
 * Canonical shareable location of one Documentation article: the index,
 * scrolled to and expanding that article's row (client: document links are
 * `/documentation#<slug>`, never the history page).
 */
export function documentationAnchorHref(slug: string): string {
  return `/documentation#${encodeURIComponent(slug)}`;
}

/** The article slug a `location.hash` points at, if it names a known article. */
export function slugFromHash(hash: string, slugs: ReadonlySet<string>): string | null {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!raw) return null;
  let slug: string;
  try {
    slug = decodeURIComponent(raw);
  } catch {
    return null;
  }
  return slugs.has(slug) ? slug : null;
}
