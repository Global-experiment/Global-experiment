import { describe, expect, it } from "vitest";
import type { BlockObjectResponse, RichTextItemResponse } from "@notionhq/client/build/src/api-endpoints";
import { mapNotionBlockToContentBlock, mapRichText } from "./blockMapper";

// Test-only fixtures: real Notion API objects carry many more fields than
// our mapper reads. Casting a minimal shape keeps these tests focused on
// the fields we actually consume, rather than fighting full SDK typing.
function richText(plain_text: string, href: string | null = null): RichTextItemResponse {
  return { plain_text, href } as unknown as RichTextItemResponse;
}

function block(partial: Record<string, unknown>): BlockObjectResponse {
  return partial as unknown as BlockObjectResponse;
}

describe("mapRichText", () => {
  it("maps plain text runs", () => {
    expect(mapRichText([richText("hello")])).toEqual([{ kind: "text", value: "hello" }]);
  });

  it("maps a run with an href to a link", () => {
    expect(mapRichText([richText("Documentation", "https://example.org/docs")])).toEqual([
      { kind: "link", value: "Documentation", href: "https://example.org/docs" },
    ]);
  });
});

describe("mapNotionBlockToContentBlock", () => {
  it("maps heading_1/2/3 blocks with the correct level", () => {
    expect(mapNotionBlockToContentBlock(block({ type: "heading_1", heading_1: { rich_text: [richText("A")] } }))).toEqual({
      kind: "heading",
      level: 1,
      text: [{ kind: "text", value: "A" }],
    });
    expect(mapNotionBlockToContentBlock(block({ type: "heading_2", heading_2: { rich_text: [richText("B")] } }))).toMatchObject({
      level: 2,
    });
    expect(mapNotionBlockToContentBlock(block({ type: "heading_3", heading_3: { rich_text: [richText("C")] } }))).toMatchObject({
      level: 3,
    });
  });

  it("maps paragraph blocks", () => {
    expect(
      mapNotionBlockToContentBlock(block({ type: "paragraph", paragraph: { rich_text: [richText("Hello")] } })),
    ).toEqual({ kind: "paragraph", text: [{ kind: "text", value: "Hello" }] });
  });

  it("falls back to unsupported for any other block type", () => {
    expect(mapNotionBlockToContentBlock(block({ type: "bulleted_list_item" }))).toEqual({
      kind: "unsupported",
    });
    expect(mapNotionBlockToContentBlock(block({ type: "image" }))).toEqual({ kind: "unsupported" });
    expect(mapNotionBlockToContentBlock(block({ type: "code" }))).toEqual({ kind: "unsupported" });
  });
});
