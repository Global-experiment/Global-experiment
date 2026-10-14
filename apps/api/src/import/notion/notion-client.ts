/**
 * Minimal read-only Notion API client for the importers: database schema,
 * and every page of a database (cursor pagination). Retries 429 and 5xx
 * with exponential backoff (honouring Retry-After). The token is only ever
 * sent in the Authorization header — never logged, never in an error.
 */
export const NOTION_VERSION = "2022-06-28";
const API = "https://api.notion.com/v1";

export interface NotionClientOptions {
  token: string;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  /** Total attempts per request, first try included. */
  maxAttempts?: number;
  baseDelayMs?: number;
}

/** A Notion property value as the API returns it (only the shapes the importers read). */
export interface NotionProperty {
  id?: string;
  type: string;
  title?: { plain_text: string }[];
  rich_text?: { plain_text: string }[];
  select?: { name: string } | null;
  multi_select?: { name: string }[];
  relation?: { id: string }[];
  /** True when Notion truncated a relation (more than 25 linked pages): read the page property to get them all. */
  has_more?: boolean;
  email?: string | null;
  url?: string | null;
  phone_number?: string | null;
  checkbox?: boolean;
  date?: { start: string; end?: string | null } | null;
  unique_id?: { prefix: string | null; number: number | null };
  number?: number | null;
}

export interface NotionPage {
  id: string;
  created_time: string;
  archived?: boolean;
  in_trash?: boolean;
  properties: Record<string, NotionProperty>;
}

export interface NotionDatabase {
  id: string;
  title: { plain_text: string }[];
  properties: Record<string, { type: string }>;
}

export class NotionApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "NotionApiError";
  }
}

const shortId = (id: string) => `${id.replace(/-/g, "").slice(0, 8)}…`;

/** What the importers read through: the Notion client, or a test fixture with the same shape. */
export type NotionReader = Pick<NotionClient, "database" | "allPages" | "relationIds">;

export class NotionClient {
  private readonly fetch: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly maxAttempts: number;
  private readonly baseDelayMs: number;

  constructor(private readonly options: NotionClientOptions) {
    if (!options.token) throw new Error("The Notion API token is missing.");
    this.fetch = options.fetch ?? globalThis.fetch;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.maxAttempts = options.maxAttempts ?? 6;
    this.baseDelayMs = options.baseDelayMs ?? 500;
  }

  database(databaseId: string): Promise<NotionDatabase> {
    return this.request<NotionDatabase>("GET", `/databases/${databaseId}`, undefined, `database ${shortId(databaseId)}`);
  }

  /** Every page of a database, following `next_cursor` until the end. */
  async allPages(databaseId: string): Promise<NotionPage[]> {
    const pages: NotionPage[] = [];
    let cursor: string | undefined;
    do {
      const body: Record<string, unknown> = { page_size: 100 };
      if (cursor) body.start_cursor = cursor;
      const result = await this.request<{ results: NotionPage[]; has_more: boolean; next_cursor: string | null }>(
        "POST",
        `/databases/${databaseId}/query`,
        body,
        `query of database ${shortId(databaseId)}`,
      );
      pages.push(...result.results);
      cursor = result.has_more && result.next_cursor ? result.next_cursor : undefined;
    } while (cursor);
    return pages;
  }

  /**
   * Every page id of one relation property. A database query returns at
   * most 25 related pages per relation (`has_more`); this pages through the
   * property endpoint to get them all.
   */
  async relationIds(pageId: string, propertyId: string): Promise<string[]> {
    const ids: string[] = [];
    let cursor: string | undefined;
    do {
      const query = cursor ? `?start_cursor=${encodeURIComponent(cursor)}` : "";
      const result = await this.request<{ results: { relation?: { id: string } }[]; has_more: boolean; next_cursor: string | null }>(
        "GET",
        `/pages/${pageId}/properties/${encodeURIComponent(propertyId)}${query}`,
        undefined,
        `relation of page ${shortId(pageId)}`,
      );
      for (const item of result.results) if (item.relation) ids.push(item.relation.id);
      cursor = result.has_more && result.next_cursor ? result.next_cursor : undefined;
    } while (cursor);
    return ids;
  }

  private async request<T>(method: "GET" | "POST", path: string, body: unknown, what: string): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      let response: Response;
      try {
        response = await this.fetch(`${API}${path}`, {
          method,
          headers: {
            Authorization: `Bearer ${this.options.token}`,
            "Notion-Version": NOTION_VERSION,
            "Content-Type": "application/json",
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
      } catch (error) {
        // Network failure: as retryable as a 5xx.
        if (attempt < this.maxAttempts) {
          await this.sleep(this.delay(attempt));
          continue;
        }
        throw new NotionApiError(0, "network_error", `Notion ${what} failed: ${error instanceof Error ? error.message : "network error"}.`);
      }

      if (response.ok) return (await response.json()) as T;

      const retryable = response.status === 429 || response.status >= 500;
      if (retryable && attempt < this.maxAttempts) {
        const retryAfter = Number(response.headers.get("retry-after"));
        await this.sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : this.delay(attempt));
        continue;
      }
      const payload = (await response.json().catch(() => ({}))) as { code?: string; message?: string };
      throw new NotionApiError(
        response.status,
        payload.code ?? "http_error",
        `Notion ${what} failed with ${response.status} ${payload.code ?? ""}${retryable ? ` after ${attempt} attempts` : ""}: ${payload.message ?? response.statusText}`.trim(),
      );
    }
  }

  private delay(attempt: number) {
    return this.baseDelayMs * 2 ** (attempt - 1);
  }
}

/** The visible text of a title/rich_text property: all segments joined, links ignored. */
export function plainText(property: NotionProperty | undefined): string {
  if (!property) return "";
  const segments = property.type === "title" ? property.title : property.type === "rich_text" ? property.rich_text : undefined;
  return (segments ?? []).map((segment) => segment.plain_text).join("");
}
