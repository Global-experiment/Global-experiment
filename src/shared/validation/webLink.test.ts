import { describe, expect, it } from "vitest";
import { isWebLink } from "./webLink";

// Same cases as apps/api/src/common/web-link.test.ts: the page and the API agree.
describe("link validation", () => {
  it.each(["https://example.org", "http://example.org/path?q=1", "x.com/profile", "linkedin.com/in/someone", "www.workana.com", "https://sub.domain.co.uk/a#b"])("accepts %s", (value) => {
    expect(isWebLink(value)).toBe(true);
  });
  it.each(["", "not a link", "example", "https://", "mailto:a@example.org", "javascript:alert(1)", "ftp://example.org", "https://localhost", "https://user:pass@example.org", "https://exa mple.org", "example.c"])("refuses %s", (value) => {
    expect(isWebLink(value)).toBe(false);
  });
});
