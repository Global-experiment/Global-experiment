import type {
  BlockObjectResponse,
  RichTextItemResponse,
} from "@notionhq/client/build/src/api-endpoints";
import type { DocumentationContentBlock, DocumentationRichText } from "@/modules/documentation/domain/types";

export function mapRichText(richText: RichTextItemResponse[]): DocumentationRichText[] {
  return richText.map((item) => {
    if (item.href) {
      return { kind: "link", value: item.plain_text, href: item.href };
    }
    return { kind: "text", value: item.plain_text };
  });
}

/**
 * Maps a single Notion block to our internal content model. Only the block
 * types actually evidenced in current Documentation content (headings 1-3,
 * paragraphs) are mapped; anything else becomes `unsupported` rather than
 * guessed at — see modules/documentation/domain/types.ts.
 */
export function mapNotionBlockToContentBlock(
  block: BlockObjectResponse,
): DocumentationContentBlock {
  switch (block.type) {
    case "heading_1":
      return { kind: "heading", level: 1, text: mapRichText(block.heading_1.rich_text) };
    case "heading_2":
      return { kind: "heading", level: 2, text: mapRichText(block.heading_2.rich_text) };
    case "heading_3":
      return { kind: "heading", level: 3, text: mapRichText(block.heading_3.rich_text) };
    case "paragraph":
      return { kind: "paragraph", text: mapRichText(block.paragraph.rich_text) };
    default:
      return { kind: "unsupported" };
  }
}
