/**
 * How many in-app navigations this tab has made in the current session.
 * `window.history.length` alone can't answer "is there an in-app page to
 * go back to": it counts entries from before the visitor arrived (an
 * external referrer, a browser's blank new-tab entry), so a directly
 * opened article could "go back" out of the app. NavigationTracker
 * increments this on every client-side route change; HistoryBackButton
 * only uses real history when the count shows a previous in-app page.
 */
const KEY = "ge-nav-depth";

export function readNavigationDepth(): number {
  try {
    return Number(sessionStorage.getItem(KEY) ?? "0") || 0;
  } catch {
    return 0;
  }
}

export function writeNavigationDepth(depth: number): void {
  try {
    sessionStorage.setItem(KEY, String(depth));
  } catch {
    // sessionStorage unavailable — the back control falls back to its href.
  }
}

/**
 * Pure decision, unit-testable: go back through history only when at least
 * one earlier in-app page exists in this tab; otherwise use the fallback link.
 */
export function shouldUseHistoryBack(navigationDepth: number): boolean {
  return navigationDepth > 1;
}
