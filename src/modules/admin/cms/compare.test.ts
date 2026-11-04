import { describe, expect, it } from "vitest";
import type { ContentBlock } from "@/shared/content/types";
import { compareBlocks } from "./compare";

const p = (value: string): ContentBlock => ({ kind: "paragraph", text: [{ kind: "text", value }] });
const h = (value: string): ContentBlock => ({ kind: "heading", level: 2, text: [{ kind: "text", value }] });

describe("compareBlocks (Versions page)", () => {
  it("keeps the page in order and marks what was removed and added", () => {
    const result = compareBlocks([h("Summary"), p("Old wording."), p("Kept.")], [h("Summary"), p("New wording."), p("Kept."), p("Added at the end.")]);
    expect(result.map((item) => [item.change, item.block.kind === "paragraph" || item.block.kind === "heading" ? item.block.text[0]!.value : ""])).toEqual([
      ["same", "Summary"],
      ["removed", "Old wording."],
      ["added", "New wording."],
      ["same", "Kept."],
      ["added", "Added at the end."],
    ]);
  });

  it("sees a heading level change and ignores empty paragraphs", () => {
    const result = compareBlocks([h("Title"), p(" ")], [{ kind: "heading", level: 3, text: [{ kind: "text", value: "Title" }] }]);
    expect(result.map((item) => item.change)).toEqual(["removed", "added"]);
    expect(compareBlocks([p("Same")], [p("Same")]).every((item) => item.change === "same")).toBe(true);
  });
});
