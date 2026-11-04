import type { NotionBlock, NotionPage, NotionSource } from "./notion-import.js";

const NOTION_VERSION = "2025-09-03";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * Notion's public API, READ-ONLY, for the one-time import: page and block
 * reads, and one database query. Any other request is refused here, before
 * it leaves the machine. The token is sent to api.notion.com only and is
 * never printed.
 */
export class NotionHttpSource implements NotionSource {
  constructor(
    private readonly token: string,
    private readonly homePageId: string,
    private readonly documentationDatabaseId: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  private async call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    const readOnly = method === "GET" || (method === "POST" && /^data_sources\/[0-9a-f-]+\/query$/.test(path));
    if (!readOnly) throw new Error("The Notion import only reads from Notion.");
    for (let attempt = 1; ; attempt++) {
      const response = await this.fetcher(`https://api.notion.com/v1/${path}`, {
        method,
        headers: { authorization: `Bearer ${this.token}`, "notion-version": NOTION_VERSION, "content-type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(30_000),
      });
      // Notion's rate limit (~3 requests a second): wait as told, a few times.
      if (response.status === 429 && attempt < 5) {
        await new Promise((resolve) => setTimeout(resolve, Number(response.headers.get("retry-after") ?? "1") * 1000));
        continue;
      }
      if (!response.ok) throw new Error(`Notion answered ${response.status} to ${method} ${path.split("/")[0]}.`);
      return (await response.json()) as T;
    }
  }

  private async children(id: string): Promise<NotionBlock[]> {
    const blocks: NotionBlock[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.call<{ results: NotionBlock[]; has_more: boolean; next_cursor: string | null }>(
        "GET",
        `blocks/${id}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ""}`,
      );
      for (const block of page.results) {
        if (block.has_children && block.type !== "child_page" && block.type !== "child_database") block.children = await this.children(block.id);
        blocks.push(block);
      }
      cursor = page.has_more ? (page.next_cursor ?? undefined) : undefined;
    } while (cursor);
    return blocks;
  }

  async homePage() {
    const page = await this.call<NotionPage>("GET", `pages/${this.homePageId}`);
    return { page, blocks: await this.children(this.homePageId) };
  }

  async documentationPages() {
    const database = await this.call<{ data_sources?: { id: string }[] }>("GET", `databases/${this.documentationDatabaseId}`);
    const dataSource = database.data_sources?.[0]?.id;
    if (!dataSource) throw new Error("The Documentation database has no data source.");
    const pages: NotionPage[] = [];
    let cursor: string | undefined;
    do {
      const result = await this.call<{ results: NotionPage[]; has_more: boolean; next_cursor: string | null }>("POST", `data_sources/${dataSource}/query`, {
        page_size: 100,
        ...(cursor ? { start_cursor: cursor } : {}),
      });
      pages.push(...result.results);
      cursor = result.has_more ? (result.next_cursor ?? undefined) : undefined;
    } while (cursor);
    const out = [];
    for (const page of pages) out.push({ page, blocks: await this.children(page.id) });
    return out;
  }

  /** An image file (Notion's own signed link, or an external https link), at most 5 MB. */
  async download(url: string): Promise<Buffer> {
    if (!url.startsWith("https://")) throw new Error("Only https images are copied.");
    const response = await this.fetcher(url, { signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new Error(`An image couldn't be downloaded (${response.status}).`);
    const length = Number(response.headers.get("content-length") ?? "0");
    if (length > MAX_IMAGE_BYTES) throw new Error("An image is over 5 MB.");
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > MAX_IMAGE_BYTES) throw new Error("An image is over 5 MB.");
    return bytes;
  }
}
