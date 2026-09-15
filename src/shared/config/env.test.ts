import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.resetModules();
  process.env = { ...ORIGINAL_ENV };
  delete process.env.DATABASE_URL;
  delete process.env.NOTION_API_KEY;
  delete process.env.NOTION_DOCUMENTATION_DB_ID;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("getNotionEnv", () => {
  it("throws a descriptive error when required variables are missing", async () => {
    const { getNotionEnv, EnvValidationError } = await import("./env");
    expect(() => getNotionEnv()).toThrow(EnvValidationError);
  });

  it("parses successfully when all required variables are present", async () => {
    process.env.NOTION_API_KEY = "secret_abc";
    process.env.NOTION_DOCUMENTATION_DB_ID = "db-id-123";

    const { getNotionEnv } = await import("./env");
    expect(getNotionEnv().NOTION_DOCUMENTATION_DB_ID).toBe("db-id-123");
  });

  it("does not require DATABASE_URL", async () => {
    process.env.NOTION_API_KEY = "secret_abc";
    process.env.NOTION_DOCUMENTATION_DB_ID = "db-id-123";

    const { getNotionEnv } = await import("./env");
    expect(() => getNotionEnv()).not.toThrow();
  });

  it("caches the parsed result across calls", async () => {
    process.env.NOTION_API_KEY = "secret_abc";
    process.env.NOTION_DOCUMENTATION_DB_ID = "db-id-123";

    const { getNotionEnv } = await import("./env");
    const first = getNotionEnv();
    process.env.NOTION_DOCUMENTATION_DB_ID = "changed";
    expect(getNotionEnv()).toBe(first);
  });
});

describe("isNotionConfigured", () => {
  it("returns false when Notion variables are missing", async () => {
    const { isNotionConfigured } = await import("./env");
    expect(isNotionConfigured()).toBe(false);
  });

  it("returns true when Notion variables are present", async () => {
    process.env.NOTION_API_KEY = "secret_abc";
    process.env.NOTION_DOCUMENTATION_DB_ID = "db-id-123";

    const { isNotionConfigured } = await import("./env");
    expect(isNotionConfigured()).toBe(true);
  });
});

describe("getDatabaseEnv", () => {
  it("throws a descriptive error when DATABASE_URL is missing", async () => {
    const { getDatabaseEnv, EnvValidationError } = await import("./env");
    expect(() => getDatabaseEnv()).toThrow(EnvValidationError);
  });

  it("does not require Notion variables", async () => {
    process.env.DATABASE_URL = "postgres://user:pass@localhost:5432/db";

    const { getDatabaseEnv } = await import("./env");
    expect(() => getDatabaseEnv()).not.toThrow();
  });
});
