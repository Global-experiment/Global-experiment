import { Client } from "@notionhq/client";
import { getNotionEnv } from "@/shared/config/env";

let cachedClient: Client | undefined;

/**
 * Lazily creates the Notion SDK client. This is the only file allowed to
 * import from "@notionhq/client" outside this integrations/notion/ folder —
 * see docs/architecture/decisions/003-notion-temporary-adapter.md.
 */
export function getNotionClient(): Client {
  if (cachedClient) return cachedClient;

  const env = getNotionEnv();
  cachedClient = new Client({ auth: env.NOTION_API_KEY });
  return cachedClient;
}
