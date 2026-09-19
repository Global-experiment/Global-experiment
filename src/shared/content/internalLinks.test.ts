import { describe, expect, it } from "vitest";
import { isInternalHref, normalizeInternalLink } from "./internalLinks";

describe("normalizeInternalLink", () => {
  it("rewrites production documentation links to internal routes", () => {
    expect(normalizeInternalLink("https://globalexperiment.org/documentation/public-treasury")).toBe(
      "/documentation/public-treasury",
    );
    expect(normalizeInternalLink("https://www.globalexperiment.org/documentation/a-b/")).toBe(
      "/documentation/a-b",
    );
    expect(normalizeInternalLink("https://globalexperiment.org/documentation")).toBe("/documentation");
  });

  it("preserves hash and query on rewritten links", () => {
    expect(normalizeInternalLink("https://globalexperiment.org/documentation/x#section")).toBe(
      "/documentation/x#section",
    );
  });

  it("leaves external URLs, mailto links and lookalike hosts untouched", () => {
    for (const href of [
      "https://www.figma.com/design/abc",
      "mailto:donations@globalexperiment.org",
      "https://globalexperiment.org.evil.example/documentation/x",
      "https://evil.example/documentation/x",
      "ftp://globalexperiment.org/documentation/x",
    ]) {
      expect(normalizeInternalLink(href)).toBe(href);
    }
  });

  it("leaves non-documentation pages on the production domain alone", () => {
    expect(normalizeInternalLink("https://globalexperiment.org/donate")).toBe(
      "https://globalexperiment.org/donate",
    );
  });

  it("leaves relative and malformed values as written", () => {
    expect(normalizeInternalLink("/documentation/x")).toBe("/documentation/x");
    expect(normalizeInternalLink("not a url")).toBe("not a url");
  });
});

describe("isInternalHref", () => {
  it("treats only single-slash paths as internal", () => {
    expect(isInternalHref("/documentation/x")).toBe(true);
    expect(isInternalHref("//evil.example")).toBe(false);
    expect(isInternalHref("https://example.org")).toBe(false);
    expect(isInternalHref("mailto:a@b.c")).toBe(false);
  });
});
