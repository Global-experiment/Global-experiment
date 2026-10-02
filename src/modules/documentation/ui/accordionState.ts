/**
 * Which Documentation rows are expanded. Two independent layers:
 *
 * - `open`: the normal accordion — rows the visitor opened themselves
 *   (or the one `#slug` deep link targeted).
 * - `searchCollapsed`: while a search is active every matching row is
 *   auto-expanded (client feedback); a visitor can still fold one away,
 *   which is recorded here and forgotten whenever the query changes.
 *
 * Clearing the search therefore returns exactly to the normal accordion.
 */
export interface AccordionState {
  open: ReadonlySet<string>;
  searchCollapsed: ReadonlySet<string>;
}

export const initialAccordionState: AccordionState = { open: new Set(), searchCollapsed: new Set() };

export function isExpanded(state: AccordionState, slug: string, searching: boolean): boolean {
  return searching ? !state.searchCollapsed.has(slug) : state.open.has(slug);
}

function toggled(set: ReadonlySet<string>, slug: string): Set<string> {
  const next = new Set(set);
  if (next.has(slug)) next.delete(slug);
  else next.add(slug);
  return next;
}

export function toggleRow(state: AccordionState, slug: string, searching: boolean): AccordionState {
  return searching
    ? { ...state, searchCollapsed: toggled(state.searchCollapsed, slug) }
    : { ...state, open: toggled(state.open, slug) };
}

/** A new query re-expands every match. */
export function queryChanged(state: AccordionState): AccordionState {
  return state.searchCollapsed.size === 0 ? state : { ...state, searchCollapsed: new Set() };
}

/** Deep link: expand only the target, collapse every other row. */
export function focusRow(slug: string): AccordionState {
  return { open: new Set([slug]), searchCollapsed: new Set() };
}
