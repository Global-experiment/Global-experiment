import { describe, expect, it } from "vitest";
import {
  arrangeColumns,
  columnWidth,
  EMPTY_PREFS,
  MAX_COLUMN_WIDTH,
  MIN_COLUMN_WIDTH,
  moveColumn,
  orderColumns,
  parsePrefs,
  resetColumnWidth,
  setColumnWidth,
  stepColumn,
  stickyOffsets,
  toggleFrozen,
  toggleHidden,
  type ColumnPrefs,
} from "./columnPrefs";

const columns = [
  { id: "name", width: 170 },
  { id: "state", width: 130 },
  { id: "source", width: 124 },
  { id: "note", width: 337 },
];
const ids = (prefs: ColumnPrefs) => arrangeColumns(columns, prefs).columns.map((c) => c.id);
const knownIds = columns.map((c) => c.id);

describe("column preferences", () => {
  it("hides and re-shows a column", () => {
    const hidden = toggleHidden(EMPTY_PREFS, "state");
    expect(ids(hidden)).toEqual(["name", "source", "note"]);
    expect(ids(toggleHidden(hidden, "state"))).toHaveLength(4);
  });

  it("moves frozen columns first, keeping their relative order", () => {
    const prefs = toggleFrozen(toggleFrozen(EMPTY_PREFS, "note"), "state");
    const arranged = arrangeColumns(columns, prefs);
    expect(arranged.columns.map((c) => c.id)).toEqual(["state", "note", "name", "source"]);
    expect(arranged.frozenCount).toBe(2);
  });

  it("unfreezes a column when it is hidden", () => {
    const prefs = toggleHidden(toggleFrozen(EMPTY_PREFS, "state"), "state");
    expect(prefs.hidden).toEqual(["state"]);
    expect(prefs.frozen).toEqual([]);
  });
});

describe("column widths", () => {
  it("uses the resized width, else the default", () => {
    const prefs = setColumnWidth(EMPTY_PREFS, "name", 250.4);
    expect(columnWidth(columns[0]!, prefs)).toBe(250);
    expect(columnWidth(columns[1]!, prefs)).toBe(130);
  });

  it("clamps to a minimum and maximum width", () => {
    expect(setColumnWidth(EMPTY_PREFS, "name", 10).widths.name).toBe(MIN_COLUMN_WIDTH);
    expect(setColumnWidth(EMPTY_PREFS, "name", 99_999).widths.name).toBe(MAX_COLUMN_WIDTH);
  });

  it("resets to the default width", () => {
    const prefs = resetColumnWidth(setColumnWidth(EMPTY_PREFS, "name", 300), "name");
    expect(prefs.widths).toEqual({});
    expect(columnWidth(columns[0]!, prefs)).toBe(170);
  });

  it("recomputes sticky offsets of frozen columns from resized widths", () => {
    let prefs = toggleFrozen(toggleFrozen(EMPTY_PREFS, "name"), "state");
    prefs = setColumnWidth(prefs, "name", 260);
    const { columns: arranged, frozenCount } = arrangeColumns(columns, prefs);
    const widths = arranged.map((column) => columnWidth(column, prefs));
    expect(stickyOffsets(widths, frozenCount)).toEqual([0, 260]);
    expect(stickyOffsets(widths, 0)).toEqual([]);
  });
});

describe("column order", () => {
  it("applies the stored order; unknown new columns keep their default place after it", () => {
    const prefs = { ...EMPTY_PREFS, order: ["note", "name"] };
    expect(orderColumns(columns, prefs).map((c) => c.id)).toEqual(["note", "name", "state", "source"]);
  });

  it("moves a column within the scrolling zone", () => {
    const prefs = moveColumn(columns, EMPTY_PREFS, "note", 1);
    expect(ids(prefs)).toEqual(["name", "note", "state", "source"]);
    expect(prefs.frozen).toEqual([]);
  });

  it("freezes a column dropped inside the frozen zone", () => {
    const frozen = toggleFrozen(toggleFrozen(EMPTY_PREFS, "name"), "state"); // [name*, state*, source, note]
    const prefs = moveColumn(columns, frozen, "note", 1);
    expect(ids(prefs)).toEqual(["name", "note", "state", "source"]);
    expect(arrangeColumns(columns, prefs).frozenCount).toBe(3);
  });

  it("does not freeze a column dropped right after the frozen zone", () => {
    const frozen = toggleFrozen(EMPTY_PREFS, "name"); // [name*, state, source, note]
    const prefs = moveColumn(columns, frozen, "note", 1);
    expect(ids(prefs)).toEqual(["name", "note", "state", "source"]);
    expect(arrangeColumns(columns, prefs).frozenCount).toBe(1);
  });

  it("reorders within the frozen zone and unfreezes a column dragged out of it", () => {
    const frozen = toggleFrozen(toggleFrozen(EMPTY_PREFS, "name"), "state"); // [name*, state*, source, note]
    const within = moveColumn(columns, frozen, "name", 1);
    expect(ids(within)).toEqual(["state", "name", "source", "note"]);
    expect(arrangeColumns(columns, within).frozenCount).toBe(2);

    const out = moveColumn(columns, frozen, "name", 2);
    expect(ids(out)).toEqual(["state", "source", "name", "note"]);
    expect(out.frozen).toEqual(["state"]);
  });

  it("keeps hidden columns in their stored slot", () => {
    const hidden = toggleHidden(EMPTY_PREFS, "state"); // visible [name, source, note]
    const prefs = moveColumn(columns, hidden, "note", 0);
    expect(ids(prefs)).toEqual(["note", "name", "source"]);
    expect(orderColumns(columns, prefs).map((c) => c.id)).toEqual(["note", "state", "name", "source"]);
  });

  it("ignores unknown columns and clamps the target index", () => {
    expect(moveColumn(columns, EMPTY_PREFS, "nope", 0)).toBe(EMPTY_PREFS);
    expect(ids(moveColumn(columns, EMPTY_PREFS, "name", 99))).toEqual(["state", "source", "note", "name"]);
  });
});

describe("keyboard column steps", () => {
  it("moves one place within a zone", () => {
    const right = stepColumn(columns, EMPTY_PREFS, "name", 1);
    expect(right.change).toBe("moved");
    expect(ids(right.prefs)).toEqual(["state", "name", "source", "note"]);
    const left = stepColumn(columns, right.prefs, "name", -1);
    expect(ids(left.prefs)).toEqual(["name", "state", "source", "note"]);
  });

  it("freezes/unfreezes in place at the frozen boundary instead of jumping", () => {
    const frozen = toggleFrozen(EMPTY_PREFS, "name"); // [name*, state, source, note]
    const out = stepColumn(columns, frozen, "name", 1);
    expect(out.change).toBe("unfrozen");
    expect(ids(out.prefs)).toEqual(["name", "state", "source", "note"]);
    expect(out.prefs.frozen).toEqual([]);

    const into = stepColumn(columns, frozen, "state", -1);
    expect(into.change).toBe("frozen");
    expect(ids(into.prefs)).toEqual(["name", "state", "source", "note"]);
    expect(arrangeColumns(columns, into.prefs).frozenCount).toBe(2);
  });

  it("does nothing past either end", () => {
    expect(stepColumn(columns, EMPTY_PREFS, "name", -1).change).toBe("none");
    expect(stepColumn(columns, EMPTY_PREFS, "note", 1).change).toBe("none");
  });
});

describe("stored preferences", () => {
  it("parses defensively, dropping unknown ids, bad widths and duplicates", () => {
    const raw = JSON.stringify({
      hidden: ["state", "evil"],
      frozen: [1, "name"],
      widths: { name: 9000, note: "wide", evil: 100, source: 20 },
      order: ["note", "note", "name", "evil"],
    });
    expect(parsePrefs(raw, knownIds)).toEqual({
      hidden: ["state"],
      frozen: ["name"],
      widths: { name: MAX_COLUMN_WIDTH, source: MIN_COLUMN_WIDTH },
      order: ["note", "name"],
    });
  });

  it("reads preferences stored before widths and order existed", () => {
    expect(parsePrefs('{"hidden":["state"],"frozen":["name"]}', knownIds)).toEqual({
      hidden: ["state"],
      frozen: ["name"],
      widths: {},
      order: [],
    });
  });

  it("falls back to defaults for missing or malformed data", () => {
    expect(parsePrefs("not json", knownIds)).toEqual(EMPTY_PREFS);
    expect(parsePrefs(null, knownIds)).toEqual(EMPTY_PREFS);
  });
});
