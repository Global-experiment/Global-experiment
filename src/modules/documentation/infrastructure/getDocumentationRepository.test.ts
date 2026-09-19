import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  delete process.env.NOTION_API_KEY;
  delete process.env.NOTION_DOCUMENTATION_DB_ID;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getDocumentationRepository", () => {
  for (const mode of ["development", "production", "test"] as const) {
    it(`is always the live Notion repository in ${mode}`, async () => {
      vi.stubEnv("NODE_ENV", mode);
      const { getDocumentationRepository } = await import("./getDocumentationRepository");
      const { NotionDocumentationRepository } = await import("./NotionDocumentationRepository");
      expect(getDocumentationRepository()).toBeInstanceOf(NotionDocumentationRepository);
    });

    it(`fails clearly in ${mode} when Notion is not configured — no placeholder articles`, async () => {
      vi.stubEnv("NODE_ENV", mode);
      const { getDocumentationRepository } = await import("./getDocumentationRepository");
      await expect(getDocumentationRepository().listPublished()).rejects.toThrow(/NOTION_API_KEY/);
      await expect(getDocumentationRepository().getBySlug("introduction")).rejects.toThrow(/NOTION_API_KEY/);
    });
  }
});
