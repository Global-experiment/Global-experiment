import { describe, expect, it } from "vitest";
import { assertSchema, toSourceRow } from "../taxonomy/taxonomy-source.js";
import { NotionApiError, NotionClient, plainText, type NotionPage } from "./notion-client.js";

// No live Notion calls: a scripted fetch stands in for the API.
const TOKEN = "secret_test_token_never_printed";
const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

function scripted(responses: (() => Response)[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const sleeps: number[] = [];
  const fetchFn = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const next = responses.shift();
    if (!next) throw new Error("unexpected request");
    return next();
  }) as unknown as typeof fetch;
  const client = new NotionClient({ token: TOKEN, fetch: fetchFn, sleep: async (ms) => void sleeps.push(ms), baseDelayMs: 100, maxAttempts: 4 });
  return { client, calls, sleeps };
}

describe("Notion client", () => {
  it("follows next_cursor until the last page", async () => {
    const { client, calls } = scripted([
      () => json(200, { results: [{ id: "a" }, { id: "b" }], has_more: true, next_cursor: "c1" }),
      () => json(200, { results: [{ id: "c" }], has_more: false, next_cursor: null }),
    ]);
    const pages = await client.allPages("db-1");
    expect(pages.map((page) => page.id)).toEqual(["a", "b", "c"]);
    expect(calls.map((call) => JSON.parse(String(call.init.body)))).toEqual([{ page_size: 100 }, { page_size: 100, start_cursor: "c1" }]);
    expect(calls[0]!.url).toBe("https://api.notion.com/v1/databases/db-1/query");
    expect((calls[0]!.init.headers as Record<string, string>)["Notion-Version"]).toBe("2022-06-28");
  });

  it("retries 429 (honouring Retry-After) and 5xx with exponential backoff", async () => {
    const { client, sleeps } = scripted([
      () => json(429, { code: "rate_limited" }, { "retry-after": "2" }),
      () => json(502, { code: "bad_gateway" }),
      () => json(503, { code: "service_unavailable" }),
      () => json(200, { id: "db", title: [], properties: {} }),
    ]);
    await expect(client.database("db")).resolves.toMatchObject({ id: "db" });
    expect(sleeps).toEqual([2000, 200, 400]);
  });

  it("gives up after the last attempt, and never puts the token in the error", async () => {
    const { client } = scripted(Array.from({ length: 4 }, () => () => json(500, { code: "internal_server_error", message: "boom" })));
    const error = await client.database("12345678-aaaa-bbbb-cccc-1234567890ab").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(NotionApiError);
    expect((error as NotionApiError).message).toBe("Notion database 12345678… failed with 500 internal_server_error after 4 attempts: boom");
    expect(String((error as Error).message)).not.toContain(TOKEN);
  });

  it("doesn't retry client errors (bad token, no access)", async () => {
    const { client, calls } = scripted([() => json(401, { code: "unauthorized", message: "API token is invalid." })]);
    await expect(client.allPages("db")).rejects.toThrow("failed with 401 unauthorized: API token is invalid.");
    expect(calls).toHaveLength(1);
  });

  it("retries network failures", async () => {
    const { client } = scripted([
      () => {
        throw new TypeError("fetch failed");
      },
      () => json(200, { results: [], has_more: false, next_cursor: null }),
    ]);
    await expect(client.allPages("db")).resolves.toEqual([]);
  });
});

describe("Notion taxonomy rows", () => {
  // Notion splits an auto-linked Stable ID into segments; the visible text is all of them joined.
  const page: NotionPage = {
    id: "item-1",
    created_time: "2026-09-25T10:00:00.000Z",
    properties: {
      Expertise: { type: "title", title: [{ plain_text: "Construction management" }] },
      "Stable ID": { type: "rich_text", rich_text: [{ plain_text: "04.01.construction" }, { plain_text: "_management" }] },
      Status: { type: "select", select: { name: "Active" } },
      Field: { type: "relation", relation: [{ id: "field-1" }] },
      Domain: { type: "relation", relation: [{ id: "domain-ignored" }] },
      Team: { type: "multi_select", multi_select: [{ name: "Tech" }, { name: "Operations" }] },
    },
  };

  it("joins every text segment (ignoring Notion's auto-links) and reads the Field relation as the parent", () => {
    expect(plainText(page.properties["Stable ID"])).toBe("04.01.construction_management");
    expect(toSourceRow("expertise", page)).toEqual({
      level: "expertise",
      pageId: "item-1",
      createdTime: "2026-09-25T10:00:00.000Z",
      name: "Construction management",
      rawStableId: "04.01.construction_management",
      status: "Active",
      parentPageIds: ["field-1"],
      teams: ["Tech", "Operations"],
    });
  });

  it("refuses to run if Notion's columns were renamed or retyped", () => {
    expect(() => assertSchema("field", { properties: { Field: { type: "title" }, "Stable ID": { type: "rich_text" }, Status: { type: "status" } } })).toThrow(
      'The Notion field database changed shape: "Status" should be select, found status; "Domain" should be relation, found nothing.',
    );
    expect(() =>
      assertSchema("domain", { properties: { Domain: { type: "title" }, "Stable ID": { type: "rich_text" }, Status: { type: "select" }, Extra: { type: "url" } } }),
    ).not.toThrow();
  });
});
