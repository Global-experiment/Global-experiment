import { describe, expect, it } from "vitest";
import { parseImportArgs } from "./import-taxonomy.js";

describe("import:taxonomy arguments", () => {
  it("is a dry run unless --apply is given; --deprecate-missing is opt-in", () => {
    expect(parseImportArgs([])).toEqual({ apply: false, deprecateMissing: false });
    expect(parseImportArgs(["--dry-run"])).toEqual({ apply: false, deprecateMissing: false });
    expect(parseImportArgs(["--apply"])).toEqual({ apply: true, deprecateMissing: false });
    expect(parseImportArgs(["--apply", "--deprecate-missing"])).toEqual({ apply: true, deprecateMissing: true });
    expect(() => parseImportArgs(["--dry-run", "--apply"])).toThrow(/can't be combined/);
    expect(() => parseImportArgs(["--delete"])).toThrow(/Unknown argument/);
  });
});
