import type { BlockObjectResponse } from "@notionhq/client/build/src/api-endpoints";
import { getNotionClient } from "./client";
import { mapNotionBlockToContentBlock } from "./blockMapper";
import type { DocumentationContentBlock } from "@/modules/documentation/domain/types";
import { ProviderError } from "@/shared/errors/app-error";

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
 * Fetches a page's block content and maps it to our internal content model.
 * Current Documentation content has no nested blocks (see the Notion export
 * audit), but this recurses into any block's children defensively so
 * nested content doesn't silently disappear if it's added later.
 */
export async function fetchPageContent(pageId: string): Promise<DocumentationContentBlock[]> {
  const blocks = await fetchBlockChildren(pageId);
  const content: DocumentationContentBlock[] = [];

  for (const block of blocks) {
    content.push(mapNotionBlockToContentBlock(block));
    if (block.has_children) {
      content.push(...(await fetchPageContent(block.id)));
    }
  }

  return content;
}
