/**
 * Per-table column preferences: Figma's column menu (p40: "Freeze column",
 * "Hide column"), the columns control (gear), plus the client's 2026-10-05
 * feedback — resizable widths and a user-chosen column order. Hidden
 * columns stay listed in the columns menu so they can be shown again.
 * Frozen columns stick to the left edge while scrolling horizontally, so
 * they're laid out first. Stored per browser (localStorage) — a viewing
 * preference, not shared data.
 */

export interface ColumnPrefs {
  hidden: string[];
  frozen: string[];
  /** Resized widths in px; absent = the column's default width. */
  widths: Record<string, number>;
  /** Column ids in the user's order; absent ids keep their default place at the end. */
  order: string[];
}

export const EMPTY_PREFS: ColumnPrefs = { hidden: [], frozen: [], widths: {}, order: [] };

/** Narrowest a column can be resized to — still fits its type glyph and a few characters. */
export const MIN_COLUMN_WIDTH = 64;
export const MAX_COLUMN_WIDTH = 1200;

const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((item) => item !== id) : [...list, id]);

export function toggleHidden(prefs: ColumnPrefs, id: string): ColumnPrefs {
  const hidden = toggle(prefs.hidden, id);
  // A hidden column can't stay frozen.
  return { ...prefs, hidden, frozen: hidden.includes(id) ? prefs.frozen.filter((item) => item !== id) : prefs.frozen };
}

export function toggleFrozen(prefs: ColumnPrefs, id: string): ColumnPrefs {
  return { ...prefs, frozen: toggle(prefs.frozen, id) };
}

export const clampWidth = (width: number) => Math.round(Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, width)));

export function setColumnWidth(prefs: ColumnPrefs, id: string, width: number): ColumnPrefs {
  return { ...prefs, widths: { ...prefs.widths, [id]: clampWidth(width) } };
}

/** Back to the column's default width. */
export function resetColumnWidth(prefs: ColumnPrefs, id: string): ColumnPrefs {
  const widths = { ...prefs.widths };
  delete widths[id];
  return { ...prefs, widths };
}

/** The width to render: the resized one, else the column's default. */
export const columnWidth = (column: { id: string; width: number }, prefs: ColumnPrefs) => prefs.widths[column.id] ?? column.width;

/** All columns in the user's order; columns the stored order doesn't know keep their default order, after it. */
export function orderColumns<Column extends { id: string }>(columns: readonly Column[], prefs: ColumnPrefs): Column[] {
  const byId = new Map(columns.map((column) => [column.id, column]));
  const ordered = prefs.order.map((id) => byId.get(id)).filter((column): column is Column => column !== undefined);
  const placed = new Set(ordered.map((column) => column.id));
  return [...ordered, ...columns.filter((column) => !placed.has(column.id))];
}

/** Visible columns in display order: frozen ones first, each group in the user's order. */
export function arrangeColumns<Column extends { id: string }>(columns: readonly Column[], prefs: ColumnPrefs) {
  const visible = orderColumns(columns, prefs).filter((column) => !prefs.hidden.includes(column.id));
  const frozen = visible.filter((column) => prefs.frozen.includes(column.id));
  const rest = visible.filter((column) => !prefs.frozen.includes(column.id));
  return { columns: [...frozen, ...rest], frozenCount: frozen.length };
}

/**
 * Moves a visible column to `toIndex` in the displayed (arranged) order.
 * The frozen zone is the first `frozenCount` displayed positions, and a
 * moved column's frozen state follows where it lands:
 * - dropped inside the zone → frozen (a frozen column moved within the zone stays frozen);
 * - dropped after the zone → not frozen (it leaves the zone; the zone shrinks).
 * Hidden columns keep their place in the stored order.
 */
export function moveColumn<Column extends { id: string }>(
  columns: readonly Column[],
  prefs: ColumnPrefs,
  id: string,
  toIndex: number,
): ColumnPrefs {
  const { columns: arranged, frozenCount } = arrangeColumns(columns, prefs);
  const from = arranged.findIndex((column) => column.id === id);
  if (from === -1) return prefs;
  const wasFrozen = from < frozenCount;
  const remaining = arranged.filter((column) => column.id !== id);
  const zone = wasFrozen ? frozenCount - 1 : frozenCount; // frozen positions left after removing it
  const target = Math.max(0, Math.min(remaining.length, toIndex));
  const frozen = wasFrozen ? target <= zone : target < zone;
  const visibleOrder = [...remaining.slice(0, target).map((c) => c.id), id, ...remaining.slice(target).map((c) => c.id)];

  // Write the new visible sequence back into the slots visible columns occupied, so hidden ones don't move.
  const full = orderColumns(columns, prefs).map((column) => column.id);
  const visibleIds = new Set(visibleOrder);
  let next = 0;
  const order = full.map((columnId) => (visibleIds.has(columnId) ? visibleOrder[next++]! : columnId));

  const frozenIds = prefs.frozen.filter((frozenId) => frozenId !== id);
  return { ...prefs, order, frozen: frozen ? [...frozenIds, id] : frozenIds };
}

/**
 * One keyboard step (Alt+←/→ on a column header). Moves one place within
 * its zone; at the frozen boundary the step freezes/unfreezes the column in
 * place instead of jumping over a neighbour, so every step is a single,
 * visible change. Returns the prefs and what happened (for announcing).
 */
export function stepColumn<Column extends { id: string }>(
  columns: readonly Column[],
  prefs: ColumnPrefs,
  id: string,
  direction: -1 | 1,
): { prefs: ColumnPrefs; change: "moved" | "frozen" | "unfrozen" | "none" } {
  const { columns: arranged, frozenCount } = arrangeColumns(columns, prefs);
  const from = arranged.findIndex((column) => column.id === id);
  if (from === -1) return { prefs, change: "none" };
  const frozen = from < frozenCount;
  if (direction === 1 && frozen && from === frozenCount - 1) return { prefs: toggleFrozen(prefs, id), change: "unfrozen" };
  if (direction === -1 && !frozen && from === frozenCount && frozenCount > 0) {
    return { prefs: toggleFrozen(prefs, id), change: "frozen" };
  }
  const to = from + direction;
  if (to < 0 || to >= arranged.length) return { prefs, change: "none" };
  return { prefs: moveColumn(columns, prefs, id, to), change: "moved" };
}

/** Left offsets (px) of each frozen column, from their rendered widths. */
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
    const value = JSON.parse(raw) as Partial<Record<keyof ColumnPrefs, unknown>>;
    const clean = (list: unknown) =>
      Array.isArray(list) ? [...new Set(list.filter((id): id is string => typeof id === "string" && knownIds.includes(id)))] : [];
    const widths: Record<string, number> = {};
    if (value.widths && typeof value.widths === "object") {
      for (const [id, width] of Object.entries(value.widths)) {
        if (knownIds.includes(id) && typeof width === "number" && Number.isFinite(width)) widths[id] = clampWidth(width);
      }
    }
    return { hidden: clean(value.hidden), frozen: clean(value.frozen), widths, order: clean(value.order) };
  } catch {
    return EMPTY_PREFS;
  }
}
