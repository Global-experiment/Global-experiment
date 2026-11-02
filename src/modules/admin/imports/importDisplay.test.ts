import { describe, expect, it } from "vitest";
import { runChanges, runKindLabel } from "./importDisplay";

describe("import history display", () => {
  it("names every kind of run, the removed Notion imports' included", () => {
    expect(runKindLabel("people_csv")).toBe("People (CSV)");
    expect(runKindLabel("organizations_csv")).toBe("Organizations (CSV)");
    // Past Notion runs stay readable (OPS-154).
    expect(runKindLabel("directory")).toBe("People & organizations (Notion, removed)");
    expect(runKindLabel("treasury")).toBe("Treasury expenses (Notion, removed)");
    expect(runKindLabel("taxonomy")).toBe("Taxonomy (Notion, removed)");
    expect(runKindLabel("cms")).toBe("cms");
  });

  it("summarises a run's counts", () => {
    expect(runChanges({ counts: { changes: 12 } } as never)).toBe("12");
    expect(runChanges({ counts: { create: 3 } } as never)).toBe("3 created");
    expect(runChanges({ counts: {} } as never)).toBe("—");
  });
});
