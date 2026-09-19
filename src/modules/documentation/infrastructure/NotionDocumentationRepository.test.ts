import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();

vi.mock("@/integrations/notion/client", () => ({
  getNotionClient: () => ({ dataSources: { query: queryMock } }),
}));

vi.mock("@/integrations/notion/resolveDataSourceId", () => ({
  resolveDataSourceId: vi.fn().mockResolvedValue("data-source-id"),
}));

vi.mock("@/shared/config/env", () => ({
  getNotionDocumentationEnv: () => ({ NOTION_DOCUMENTATION_DB_ID: "db-id" }),
}));

const fetchPageContentMock = vi.fn();
vi.mock("@/integrations/notion/fetchPageBlocks", () => ({
  fetchPageContent: fetchPageContentMock,
}));

function notionPage(id: string, overrides: Record<string, unknown>) {
  return {
    id,
    created_time: "2026-01-01T00:00:00.000Z",
    properties: {
      Name: { type: "title", title: [{ plain_text: overrides.title ?? "Untitled" }] },
      Slug: { type: "rich_text", rich_text: [{ plain_text: overrides.slug ?? "untitled" }] },
      Status: { type: "select", select: { name: overrides.status ?? "Published" } },
      "Published at": { type: "date", date: { start: "2026-08-29" } },
      "Display order": { type: "number", number: overrides.displayOrder ?? 1 },
      Expertise: { type: "multi_select", multi_select: [] },
      Archive: { type: "checkbox", checkbox: overrides.archived ?? false },
    },
  };
}

describe("NotionDocumentationRepository", () => {
  beforeEach(() => {
    queryMock.mockReset();
    fetchPageContentMock.mockReset();
  });

  it("listPublished excludes unpublished/archived pages and sorts by displayOrder", async () => {
    queryMock.mockResolvedValue({
      results: [
        notionPage("1", { title: "Third", slug: "third", displayOrder: 3 }),
        notionPage("2", { title: "Draft", slug: "draft", status: "Draft" }),
        notionPage("3", { title: "First", slug: "first", displayOrder: 1 }),
        notionPage("4", { title: "Archived", slug: "archived", archived: true }),
      ],
      has_more: false,
      next_cursor: null,
    });

    const { NotionDocumentationRepository } = await import("./NotionDocumentationRepository");
    const repo = new NotionDocumentationRepository();
    const articles = await repo.listPublished();

    expect(articles.map((a) => a.slug)).toEqual(["first", "third"]);
  });

  it("getBySlug returns null for a slug that doesn't exist", async () => {
    queryMock.mockResolvedValue({ results: [], has_more: false, next_cursor: null });

    const { NotionDocumentationRepository } = await import("./NotionDocumentationRepository");
    const repo = new NotionDocumentationRepository();
    expect(await repo.getBySlug("missing")).toBeNull();
  });

  it("getBySlug returns null for an unpublished page rather than leaking it by direct slug access", async () => {
    queryMock.mockResolvedValue({
      results: [notionPage("1", { slug: "draft-article", status: "Draft" })],
      has_more: false,
      next_cursor: null,
    });

    const { NotionDocumentationRepository } = await import("./NotionDocumentationRepository");
    const repo = new NotionDocumentationRepository();
    expect(await repo.getBySlug("draft-article")).toBeNull();
  });

  it("getBySlug fetches content only for the matched page", async () => {
    queryMock.mockResolvedValue({
      results: [notionPage("42", { slug: "introduction" })],
      has_more: false,
      next_cursor: null,
    });
    fetchPageContentMock.mockResolvedValue([{ kind: "paragraph", text: [{ kind: "text", value: "Hi" }] }]);

    const { NotionDocumentationRepository } = await import("./NotionDocumentationRepository");
    const repo = new NotionDocumentationRepository();
    const article = await repo.getBySlug("introduction");

    expect(fetchPageContentMock).toHaveBeenCalledWith("42");
    expect(article?.content).toEqual([{ kind: "paragraph", text: [{ kind: "text", value: "Hi" }] }]);
  });

  it("a Notion failure is a ProviderError — never null, which the route would turn into a fake 404", async () => {
    queryMock.mockRejectedValue(new Error("Notion is down"));
    const { NotionDocumentationRepository } = await import("./NotionDocumentationRepository");
    const { ProviderError } = await import("@/shared/errors/app-error");
    const repo = new NotionDocumentationRepository();

    await expect(repo.getBySlug("introduction")).rejects.toBeInstanceOf(ProviderError);
    await expect(repo.listPublished()).rejects.toBeInstanceOf(ProviderError);
  });

  it("reads Notion on every call — nothing is cached between requests", async () => {
    queryMock.mockResolvedValue({ results: [], has_more: false, next_cursor: null });
    const { NotionDocumentationRepository } = await import("./NotionDocumentationRepository");
    const repo = new NotionDocumentationRepository();
    await repo.listPublished();
    await repo.listPublished();
    expect(queryMock).toHaveBeenCalledTimes(2);
  });
});
