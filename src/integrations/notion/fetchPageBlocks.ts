import type { BlockObjectResponse } from "@notionhq/client/build/src/api-endpoints";
import { getNotionClient } from "./client";
import { mapNotionBlockToContentBlock } from "./blockMapper";
import type { ContentBlock } from "@/shared/content/types";
import { ProviderError } from "@/shared/errors/app-error";
import { logger } from "@/shared/logging/logger";

async function fetchBlockChildren(blockId: string): Promise<BlockObjectResponse[]> {
  const notion = getNotionClient();
  const results: BlockObjectResponse[] = [];
  let cursor: string | undefined;

  try {
    do {
      const response = await notion.blocks.children.list({
        block_id: blockId,
        start_cursor: cursor,
      });
      results.push(...(response.results as BlockObjectResponse[]));
      cursor = response.has_more ? (response.next_cursor ?? undefined) : undefined;
    } while (cursor);
  } catch (cause) {
    throw new ProviderError("Failed to fetch content from Notion.", { cause });
  }

  return results;
}

/**
 * Fetches a page's block content and maps it to the shared content model.
 * Recurses into children defensively so nested content doesn't silently
 * disappear. Unsupported block types are logged (type name only — never
 * content) so editors adding one are noticed rather than ignored.
 */
export async function fetchPageContent(pageId: string): Promise<ContentBlock[]> {
  const blocks = await fetchBlockChildren(pageId);
  const content: ContentBlock[] = [];

  for (const block of blocks) {
    const mapped = mapNotionBlockToContentBlock(block);
    if (mapped.kind === "unsupported") {
      logger.warn("Unsupported Notion block type skipped", { blockType: mapped.type });
    }
    content.push(mapped);
    if (block.has_children) {
      content.push(...(await fetchPageContent(block.id)));
    }
  }

  return content;
}
