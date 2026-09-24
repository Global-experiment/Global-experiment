import { Client } from "@notionhq/client";
import { getNotionClientEnv } from "@/shared/config/env";
import { resilientFetch } from "./resilientFetch";

let cachedClient: Client | undefined;

/**
 * Lazily creates the Notion SDK client. This is the only file allowed to
 * import from "@notionhq/client" outside this integrations/notion/ folder —
 * see docs/architecture/decisions/003-notion-temporary-adapter.md.
 *
 * Uses `resilientFetch` (a short retry limited to connection-level
 * failures) instead of the SDK's default fetch — see that file for why.
 */
export function getNotionClient(): Client {
  if (cachedClient) return cachedClient;

  const env = getNotionClientEnv();
  cachedClient = new Client({ auth: env.NOTION_API_KEY, fetch: resilientFetch });
  return cachedClient;
}
