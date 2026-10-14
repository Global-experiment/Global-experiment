import { describe, expect, it } from "vitest";
import { parseDirectoryImportArgs } from "./import-directory.js";

describe("import:directory arguments", () => {
  it("is a dry run unless --apply is given", () => {
    expect(parseDirectoryImportArgs([])).toEqual({ apply: false });
    expect(parseDirectoryImportArgs(["--dry-run"])).toEqual({ apply: false });
    expect(parseDirectoryImportArgs(["--apply"])).toEqual({ apply: true });
    expect(() => parseDirectoryImportArgs(["--dry-run", "--apply"])).toThrow(/can't be combined/);
    expect(() => parseDirectoryImportArgs(["--merge-duplicates"])).toThrow(/Unknown argument/);
  });
});
