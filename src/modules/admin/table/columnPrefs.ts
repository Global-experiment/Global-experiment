/**
 * Per-table column preferences from Figma's column menu (p40: "Freeze
 * column", "Hide column") and the columns control (gear). Hidden columns
 * stay listed in the columns menu so they can be shown again. Frozen
 * columns stick to the left edge while scrolling horizontally, so they're
 * laid out first, in their original order. Stored per browser
 * (localStorage) — a viewing preference, not shared data.
 */

export interface ColumnPrefs {
  hidden: string[];
  frozen: string[];
}

export const EMPTY_PREFS: ColumnPrefs = { hidden: [], frozen: [] };

const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((item) => item !== id) : [...list, id]);

export function toggleHidden(prefs: ColumnPrefs, id: string): ColumnPrefs {
  const hidden = toggle(prefs.hidden, id);
  // A hidden column can't stay frozen.
  return { hidden, frozen: hidden.includes(id) ? prefs.frozen.filter((item) => item !== id) : prefs.frozen };
}

export function toggleFrozen(prefs: ColumnPrefs, id: string): ColumnPrefs {
  return { ...prefs, frozen: toggle(prefs.frozen, id) };
}

/** Visible columns, frozen ones first (original relative order kept in both groups). */
export function arrangeColumns<Column extends { id: string }>(columns: readonly Column[], prefs: ColumnPrefs) {
  const visible = columns.filter((column) => !prefs.hidden.includes(column.id));
  const frozen = visible.filter((column) => prefs.frozen.includes(column.id));
  const rest = visible.filter((column) => !prefs.frozen.includes(column.id));
  return { columns: [...frozen, ...rest], frozenCount: frozen.length };
}

/** Left offsets (px) of each frozen column, from their widths. */
export function stickyOffsets(widths: readonly number[], frozenCount: number): number[] {
  const offsets: number[] = [];
  let left = 0;
  for (let index = 0; index < frozenCount; index++) {
    offsets.push(left);
    left += widths[index] ?? 0;
  }
  return offsets;
}

export function parsePrefs(raw: string | null, knownIds: readonly string[]): ColumnPrefs {
  if (!raw) return EMPTY_PREFS;
  try {
    const value = JSON.parse(raw) as Partial<ColumnPrefs>;
    const clean = (list: unknown) =>
      Array.isArray(list) ? list.filter((id): id is string => typeof id === "string" && knownIds.includes(id)) : [];
    return { hidden: clean(value.hidden), frozen: clean(value.frozen) };
  } catch {
    return EMPTY_PREFS;
  }
}
