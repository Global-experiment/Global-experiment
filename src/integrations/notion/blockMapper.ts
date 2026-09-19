import type {
  BlockObjectResponse,
  RichTextItemResponse,
} from "@notionhq/client/build/src/api-endpoints";
import type { ContentBlock, RichText } from "@/shared/content/types";
import { normalizeInternalLink } from "@/shared/content/internalLinks";

export function mapRichText(richText: RichTextItemResponse[]): RichText[] {
  return richText.map((item) => {
    if (item.href) {
      return { kind: "link", value: item.plain_text, href: normalizeInternalLink(item.href) };
    }
    return { kind: "text", value: item.plain_text };
  });
}

/**
 * Maps a single Notion block to the shared content model. Only block types
 * evidenced in real content (headings 1-4, paragraphs) are mapped; any other
 * type becomes `unsupported` carrying the Notion type name so it can be
 * reported — never guessed at or silently dropped.
 */
export function mapNotionBlockToContentBlock(block: BlockObjectResponse): ContentBlock {
  switch (block.type) {
    case "heading_1":
      return { kind: "heading", level: 1, text: mapRichText(block.heading_1.rich_text) };
    case "heading_2":
      return { kind: "heading", level: 2, text: mapRichText(block.heading_2.rich_text) };
    case "heading_3":
      return { kind: "heading", level: 3, text: mapRichText(block.heading_3.rich_text) };
    case "heading_4":
      return { kind: "heading", level: 4, text: mapRichText(block.heading_4.rich_text) };
    case "paragraph":
      return { kind: "paragraph", text: mapRichText(block.paragraph.rich_text) };
    default:
      return { kind: "unsupported", type: block.type };
  }
}
