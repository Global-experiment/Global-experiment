import { describe, expect, it } from "vitest";
import { isCalendarDay, isEmail, isScore, isSlug, isWebLink, isWholeNumber } from "./field-rules.js";

/** The shared field rules (OPS-70): the admin pages and the API accept and refuse exactly these. */
describe("field rules", () => {
  it.each(["ada@example.org", "a.b-c+tag@mail.example.co.uk", "  ada@example.org  ", "o'brien@example.ie", "x@sub.domain.museum"])(
    "accepts the email %s",
    (value) => {
      expect(isEmail(value)).toBe(true);
    },
  );
  it.each([
    "",
    "ada",
    "ada@",
    "@example.org",
    "ada@example",
    "ada@example.c",
    "ada@exa_mple.org",
    "ada@@example.org",
    "ada @example.org",
    ".ada@example.org",
    "ada.@example.org",
    "a..da@example.org",
    "ada@-example.org",
    "ada@example..org",
    "Ada Lovelace <ada@example.org>",
    `${"a".repeat(65)}@example.org`,
  ])("refuses the email %s", (value) => {
    expect(isEmail(value)).toBe(false);
  });

  // The link cases the page and the API shared before (web-link.test.ts): unchanged.
  it.each([
    "https://example.org",
    "http://example.org/path?q=1",
    "x.com/profile",
    "linkedin.com/in/someone",
    "www.workana.com",
    "https://sub.domain.co.uk/a#b",
  ])("accepts the link %s", (value) => {
    expect(isWebLink(value)).toBe(true);
  });
  it.each([
    "",
    "not a link",
    "example",
    "https://",
    "mailto:a@example.org",
    "javascript:alert(1)",
    "ftp://example.org",
    "https://localhost",
    "https://user:pass@example.org",
    "https://exa mple.org",
    "example.c",
  ])("refuses the link %s", (value) => {
    expect(isWebLink(value)).toBe(false);
  });

  it("scores, whole numbers, slugs and calendar days", () => {
    expect(["0", "7", "10", " 3 "].every(isScore)).toBe(true);
    expect(["11", "-1", "2.5", "seven", ""].some(isScore)).toBe(false);
    expect(["0", "-12", "300"].every(isWholeNumber)).toBe(true);
    expect(["1.5", "x", "", "1234567890"].some(isWholeNumber)).toBe(false);
    expect(["version-0-1-scope", "home", "a1"].every(isSlug)).toBe(true);
    expect(["Version", "a--b", "-a", "a-", "a b", ""].some(isSlug)).toBe(false);
    expect(["2026-11-10", "2024-02-29"].every(isCalendarDay)).toBe(true);
    expect(["2026-02-30", "2025-02-29", "10/11/2026", ""].some(isCalendarDay)).toBe(false);
  });
});
