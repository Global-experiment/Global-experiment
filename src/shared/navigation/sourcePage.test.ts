import { describe, expect, it } from "vitest";
import { reportHref, sanitizeSourcePage, sourcePageFromSearch } from "./sourcePage";

describe("sanitizeSourcePage", () => {
  it.each([
    ["/treasury", "/treasury"],
    ["/documentation#introduction", "/documentation#introduction"],
    ["/treasury/expense/usd-60-banking", "/treasury/expense/usd-60-banking"],
    ["/donate?x=1", "/donate?x=1"],
    ["  /documentation  ", "/documentation"],
  ])("keeps internal path %s", (input, expected) => {
    expect(sanitizeSourcePage(input)).toBe(expected);
  });

  it.each([
    "https://evil.example/x",
    "//evil.example/x",
    "/\\evil.example",
    "\\\\evil.example",
    "javascript:alert(1)",
    "data:text/html,x",
    "treasury",
    "",
    "/feedback",
    "/issue?source=%2Ftreasury",
    "/ok\nInjected",
    `/${"a".repeat(400)}`,
  ])("rejects %s", (input) => {
    expect(sanitizeSourcePage(input)).toBeNull();
  });

  it("rejects non-strings", () => {
    expect(sanitizeSourcePage(null)).toBeNull();
    expect(sanitizeSourcePage(undefined)).toBeNull();
  });
});

describe("report links", () => {
  it("encode the source page", () => {
    expect(reportHref("feedback", "/treasury")).toBe("/feedback?source=%2Ftreasury");
    expect(reportHref("issue", "/documentation#introduction")).toBe("/issue?source=%2Fdocumentation%23introduction");
  });

  it("drop an invalid source instead of forwarding it", () => {
    expect(reportHref("feedback", "https://evil.example")).toBe("/feedback");
    expect(reportHref("issue", null)).toBe("/issue");
  });

  it("round-trip through the query string", () => {
    const href = reportHref("issue", "/documentation#introduction");
    expect(sourcePageFromSearch(href.slice(href.indexOf("?")))).toBe("/documentation#introduction");
    expect(sourcePageFromSearch("?source=https%3A%2F%2Fevil.example")).toBeNull();
    expect(sourcePageFromSearch("")).toBeNull();
  });
});
