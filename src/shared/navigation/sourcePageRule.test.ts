import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The page's copy of the source page rule. The rule itself is tested in sourcePage.test.ts; this checks the two
 * copies are the same file, so the composer and the API can't disagree on what they keep.
 */
describe("source page rule shared with the API", () => {
  it("is exactly the API's file, character for character", () => {
    const here = readFileSync(join(__dirname, "sourcePageRule.ts"), "utf8").replace(/\r\n/g, "\n");
    const api = readFileSync(join(__dirname, "../../../apps/api/src/common/source-page-rule.ts"), "utf8").replace(/\r\n/g, "\n");
    expect(here).toBe(api);
  });
});
