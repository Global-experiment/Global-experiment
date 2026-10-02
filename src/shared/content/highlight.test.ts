import { describe, expect, it } from "vitest";
import { splitHighlights } from "./highlight";

describe("splitHighlights", () => {
  it("marks every case-insensitive occurrence, keeping original casing", () => {
    expect(splitHighlights("Treasury and treasury TREASURY", "treasury")).toEqual([
      { text: "Treasury", match: true },
      { text: " and ", match: false },
      { text: "treasury", match: true },
      { text: " ", match: false },
      { text: "TREASURY", match: true },
    ]);
  });

  it("matches at the edges and back to back", () => {
    expect(splitHighlights("abab", "ab")).toEqual([
      { text: "ab", match: true },
      { text: "ab", match: true },
    ]);
  });

  it("does not overlap matches", () => {
    expect(splitHighlights("aaa", "aa")).toEqual([
      { text: "aa", match: true },
      { text: "a", match: false },
    ]);
  });

  it("returns the text untouched for an empty query or no match", () => {
    expect(splitHighlights("Privacy", "  ")).toEqual([{ text: "Privacy", match: false }]);
    expect(splitHighlights("Privacy", "zzz")).toEqual([{ text: "Privacy", match: false }]);
    expect(splitHighlights("", "x")).toEqual([]);
  });

  it("trims the query like the search does", () => {
    expect(splitHighlights("Open data", " data ")).toEqual([
      { text: "Open ", match: false },
      { text: "data", match: true },
    ]);
  });

  it("treats regex characters literally", () => {
    expect(splitHighlights("costs (USD) .*", "(usd)")).toEqual([
      { text: "costs ", match: false },
      { text: "(USD)", match: true },
      { text: " .*", match: false },
    ]);
  });
});
