import { describe, expect, it } from "vitest";
import type { ContentBlock } from "@/shared/content/types";
import { blocksToDoc, docToBlocks, sameBlocks } from "./editorContent";

const t = (value: string) => ({ kind: "text" as const, value });

describe("editor content ⇄ blocks (ADR 019)", () => {
  const blocks: ContentBlock[] = [
    { kind: "heading", level: 4, text: [t("A global space.")] },
    { kind: "heading", level: 2, text: [t("Summary")] },
    { kind: "paragraph", text: [t("See "), { kind: "link", value: "the scope", href: "/documentation/version-0-1-scope" }, t(".\nNext line")] },
    { kind: "list", ordered: false, items: [[t("One")], [t("Two")]] },
    { kind: "list", ordered: true, items: [[t("First")]] },
    { kind: "image", imageId: "00000000-0000-4000-8000-000000000001", alt: "A diagram" },
  ];

  it("round-trips every block kind unchanged", () => {
    expect(docToBlocks(blocksToDoc(blocks))).toEqual(blocks);
  });

  it("drops unsafe links (a pasted javascript: link becomes text) and unknown nodes", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "click", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] }] },
        { type: "codeBlock", content: [{ type: "text", text: "x" }] },
        { type: "image", attrs: { src: "https://evil.example/x.png" } },
      ],
    };
    expect(docToBlocks(doc)).toEqual([{ kind: "paragraph", text: [t("click")] }]);
  });

  it("flattens nested lists and ignores trailing empty paragraphs", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                { type: "paragraph", content: [{ type: "text", text: "Parent" }] },
                { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Child" }] }] }] },
              ],
            },
          ],
        },
        { type: "paragraph" },
        { type: "paragraph", content: [{ type: "text", text: "  " }] },
      ],
    };
    expect(docToBlocks(doc)).toEqual([{ kind: "list", ordered: false, items: [[t("Parent")], [t("Child")]] }]);
  });

  it("an empty page is one empty paragraph in the editor and no blocks out", () => {
    expect(blocksToDoc([])).toEqual({ type: "doc", content: [{ type: "paragraph" }] });
    expect(docToBlocks(blocksToDoc([]))).toEqual([]);
    expect(sameBlocks(blocks, [...blocks, { kind: "paragraph", text: [] }])).toBe(true);
  });
});
