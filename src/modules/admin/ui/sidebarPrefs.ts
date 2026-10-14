/**
 * The admin sidebar's collapsed/expanded choice (client, 2026-10-14). Kept
 * in a cookie, not localStorage, so the server renders the right width on
 * the first paint (no flash of the wrong layout). Not a secret, not
 * personal data: one word, readable by the page.
 */
export const ADMIN_SIDEBAR_COOKIE = "ge_admin_sidebar";
export const ADMIN_SIDEBAR_COLLAPSED = "collapsed";

/** Writes the choice for a year, for the admin pages only. */
export function rememberSidebar(collapsed: boolean): void {
  try {
    document.cookie = `${ADMIN_SIDEBAR_COOKIE}=${collapsed ? ADMIN_SIDEBAR_COLLAPSED : "expanded"}; Path=/admin; Max-Age=31536000; SameSite=Lax${
      location.protocol === "https:" ? "; Secure" : ""
    }`;
  } catch {
    // Cookies blocked: the choice simply isn't remembered.
  }
}
