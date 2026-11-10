import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FIELD_MESSAGES, isEmail, isWebLink } from "./fieldRules";

/**
 * The page's copy of the field rules (OPS-70). The rules themselves are tested once, with the API's copy
 * (apps/api/src/common/field-rules.test.ts); this checks the two copies are the same file, so the page and
 * the API can't disagree.
 */
describe("field rules shared with the API", () => {
  it("is exactly the API's file, character for character", () => {
    const here = readFileSync(join(__dirname, "fieldRules.ts"), "utf8").replace(/\r\n/g, "\n");
    const api = readFileSync(join(__dirname, "../../../apps/api/src/common/field-rules.ts"), "utf8").replace(/\r\n/g, "\n");
    expect(here).toBe(api);
  });

  it("keeps the messages the admin already showed", () => {
    expect(FIELD_MESSAGES.email).toBe("Invalid email address.");
    expect(FIELD_MESSAGES.link).toBe("Invalid link. Use an address like https://example.org.");
    expect(isEmail("ada@example.org") && !isEmail("ada@example")).toBe(true);
    expect(isWebLink("example.org") && !isWebLink("example")).toBe(true);
  });
});
