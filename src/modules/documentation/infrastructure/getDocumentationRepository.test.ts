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
  it("uses the fixture repository outside production when Notion isn't configured", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const { getDocumentationRepository } = await import("./getDocumentationRepository");
    const { FixtureDocumentationRepository } = await import("./FixtureDocumentationRepository");
    expect(getDocumentationRepository()).toBeInstanceOf(FixtureDocumentationRepository);
  });

  it("throws in production when Notion isn't configured, rather than silently using fixtures", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { getDocumentationRepository } = await import("./getDocumentationRepository");
    expect(() => getDocumentationRepository()).toThrow(/NOTION_API_KEY/);
  });

  it("uses the Notion repository when configured, even in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.NOTION_API_KEY = "secret";
    process.env.NOTION_DOCUMENTATION_DB_ID = "db-id";
    const { getDocumentationRepository } = await import("./getDocumentationRepository");
    const { NotionDocumentationRepository } = await import("./NotionDocumentationRepository");
    expect(getDocumentationRepository()).toBeInstanceOf(NotionDocumentationRepository);
  });
});
