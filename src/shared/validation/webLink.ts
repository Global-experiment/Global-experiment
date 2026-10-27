/**
 * Link fields (website, X, LinkedIn, other socials): validated like email
 * (client, 2026-10-22). A link is an http(s) address, with or without its
 * scheme ("x.com/profile" as in the prototype): a host name with a dot and
 * a top-level domain of 2+ letters, no spaces. Whether the page exists isn't
 * checked. The API (apps/api/src/common/web-link.ts) applies the same rule.
 */
export const INVALID_LINK = "Invalid link. Use an address like https://example.org.";

export function isWebLink(value: string): boolean {
  const text = value.trim();
  if (!text || /\s/.test(text)) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(text) && !/^https?:\/\//i.test(text)) return false;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return false;
  }
  const host = url.hostname;
  return /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(host) && !url.username && !url.password;
}
