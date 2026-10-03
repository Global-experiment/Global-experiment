import { describe, expect, it } from "vitest";
import { arrangeColumns, EMPTY_PREFS, parsePrefs, stickyOffsets, toggleFrozen, toggleHidden } from "./columnPrefs";

const columns = [{ id: "name" }, { id: "state" }, { id: "source" }, { id: "note" }];

describe("column preferences", () => {
  it("hides and re-shows a column", () => {
    const hidden = toggleHidden(EMPTY_PREFS, "state");
    expect(arrangeColumns(columns, hidden).columns.map((c) => c.id)).toEqual(["name", "source", "note"]);
    expect(arrangeColumns(columns, toggleHidden(hidden, "state")).columns).toHaveLength(4);
  });

  it("moves frozen columns first, keeping their relative order", () => {
    const prefs = toggleFrozen(toggleFrozen(EMPTY_PREFS, "note"), "state");
    const arranged = arrangeColumns(columns, prefs);
    expect(arranged.columns.map((c) => c.id)).toEqual(["state", "note", "name", "source"]);
    expect(arranged.frozenCount).toBe(2);
  });

  it("unfreezes a column when it is hidden", () => {
    const prefs = toggleHidden(toggleFrozen(EMPTY_PREFS, "state"), "state");
    expect(prefs).toEqual({ hidden: ["state"], frozen: [] });
  });

  it("computes sticky left offsets", () => {
    expect(stickyOffsets([170, 130, 124], 2)).toEqual([0, 170]);
    expect(stickyOffsets([170], 0)).toEqual([]);
  });

  it("parses stored preferences defensively", () => {
    expect(parsePrefs('{"hidden":["state","evil"],"frozen":[1,"name"]}', ["name", "state"])).toEqual({
      hidden: ["state"],
      frozen: ["name"],
    });
    expect(parsePrefs("not json", ["name"])).toEqual(EMPTY_PREFS);
    expect(parsePrefs(null, ["name"])).toEqual(EMPTY_PREFS);
  });
});
