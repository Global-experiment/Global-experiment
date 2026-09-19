import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchPageContentMock = vi.fn();
vi.mock("@/integrations/notion/fetchPageBlocks", () => ({ fetchPageContent: fetchPageContentMock }));

const t = (value: string) => [{ kind: "text", value }];

describe("NotionHomeRepository", () => {
  beforeEach(() => {
    fetchPageContentMock.mockReset();
    vi.resetModules();
    process.env.NOTION_HOME_PAGE_ID = "home-page-id";
  });

  it("reads the configured Notion page and maps it to Home content", async () => {
    fetchPageContentMock.mockResolvedValue([
      { kind: "heading", level: 4, text: t("Tagline") },
      { kind: "heading", level: 3, text: t("Section") },
      { kind: "paragraph", text: t("Body") },
    ]);
    const { NotionHomeRepository } = await import("./NotionHomeRepository");
    const home = await new NotionHomeRepository().get();

    expect(fetchPageContentMock).toHaveBeenCalledWith("home-page-id");
    expect(home.tagline).toEqual(t("Tagline"));
    expect(home.sections).toHaveLength(1);
  });

  it("reads Notion on every call — nothing is cached between requests", async () => {
    fetchPageContentMock
      .mockResolvedValueOnce([{ kind: "heading", level: 4, text: t("Version 1") }])
      .mockResolvedValueOnce([{ kind: "heading", level: 4, text: t("Version 2") }]);
    const { NotionHomeRepository } = await import("./NotionHomeRepository");
    const repo = new NotionHomeRepository();

    expect((await repo.get()).tagline).toEqual(t("Version 1"));
    expect((await repo.get()).tagline).toEqual(t("Version 2"));
    expect(fetchPageContentMock).toHaveBeenCalledTimes(2);
  });

  it("propagates Notion failures instead of substituting content", async () => {
    fetchPageContentMock.mockRejectedValue(new Error("Notion is down"));
    const { NotionHomeRepository } = await import("./NotionHomeRepository");
    await expect(new NotionHomeRepository().get()).rejects.toThrow("Notion is down");
  });

  it("fails loudly when NOTION_HOME_PAGE_ID is missing — no fallback copy", async () => {
    delete process.env.NOTION_HOME_PAGE_ID;
    const { NotionHomeRepository } = await import("./NotionHomeRepository");
    await expect(new NotionHomeRepository().get()).rejects.toThrow(/NOTION_HOME_PAGE_ID/);
    expect(fetchPageContentMock).not.toHaveBeenCalled();
  });
});
