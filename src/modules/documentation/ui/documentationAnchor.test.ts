import { describe, expect, it } from "vitest";
import { documentationAnchorHref, slugFromHash } from "./documentationAnchor";

describe("documentation anchors", () => {
  const slugs = new Set(["introduction", "privacy-policy"]);

  it("builds the canonical index anchor, never the history page", () => {
    expect(documentationAnchorHref("introduction")).toBe("/documentation#introduction");
    expect(documentationAnchorHref("privacy-policy")).not.toContain("/history");
  });

  it("resolves a hash to a known slug", () => {
    expect(slugFromHash("#introduction", slugs)).toBe("introduction");
    expect(slugFromHash("privacy-policy", slugs)).toBe("privacy-policy");
    expect(slugFromHash(documentationAnchorHref("privacy-policy").split("#")[1], slugs)).toBe("privacy-policy");
  });

  it("ignores empty, unknown and malformed hashes", () => {
    expect(slugFromHash("", slugs)).toBeNull();
    expect(slugFromHash("#", slugs)).toBeNull();
    expect(slugFromHash("#unknown", slugs)).toBeNull();
    expect(slugFromHash("#%E0%A4%A", slugs)).toBeNull();
  });
});
