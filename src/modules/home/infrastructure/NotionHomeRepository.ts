import { fetchPageContent } from "@/integrations/notion/fetchPageBlocks";
import { getNotionHomeEnv } from "@/shared/config/env";
import type { HomeRepository } from "@/modules/home/domain/HomeRepository";
import type { HomeContent } from "@/modules/home/domain/types";
import { mapHomeBlocks } from "./homeMapper";

/** Live Notion Home page, read fresh on every call (no caching layer here). */
export class NotionHomeRepository implements HomeRepository {
  async get(): Promise<HomeContent> {
    const env = getNotionHomeEnv();
    const blocks = await fetchPageContent(env.NOTION_HOME_PAGE_ID);
    return mapHomeBlocks(blocks);
  }
}
