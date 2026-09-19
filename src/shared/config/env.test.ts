import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.resetModules();
  process.env = { ...ORIGINAL_ENV };
  for (const key of [
    "DATABASE_URL",
    "NOTION_API_KEY",
    "NOTION_DOCUMENTATION_DB_ID",
    "NOTION_HOME_PAGE_ID",
  ]) {
    delete process.env[key];
  }
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("Notion environment scopes", () => {
  it("each scope fails clearly, naming the missing variable, when unset", async () => {
    const { getNotionClientEnv, getNotionDocumentationEnv, getNotionHomeEnv, EnvValidationError } =
      await import("./env");

    expect(() => getNotionClientEnv()).toThrow(EnvValidationError);
    expect(() => getNotionClientEnv()).toThrow(/NOTION_API_KEY/);
    expect(() => getNotionDocumentationEnv()).toThrow(/NOTION_DOCUMENTATION_DB_ID/);
    expect(() => getNotionHomeEnv()).toThrow(/NOTION_HOME_PAGE_ID/);
  });

  it("rejects empty values, not just absent ones", async () => {
    process.env.NOTION_API_KEY = "";
    const { getNotionClientEnv } = await import("./env");
    expect(() => getNotionClientEnv()).toThrow(/NOTION_API_KEY/);
  });

  it("parses successfully when present, and scopes are independent of each other", async () => {
    process.env.NOTION_HOME_PAGE_ID = "home-id";
    const { getNotionHomeEnv, getNotionDocumentationEnv } = await import("./env");
    expect(getNotionHomeEnv().NOTION_HOME_PAGE_ID).toBe("home-id");
    expect(() => getNotionDocumentationEnv()).toThrow(/NOTION_DOCUMENTATION_DB_ID/);
  });

  it("never echoes other secret values in an error message", async () => {
    process.env.NOTION_API_KEY = "secret-value-that-must-not-leak";
    process.env.NOTION_HOME_PAGE_ID = "";
    const { getNotionHomeEnv } = await import("./env");
    expect(() => getNotionHomeEnv()).toThrow(/NOTION_HOME_PAGE_ID/);
    try {
      getNotionHomeEnv();
    } catch (error) {
      expect(String(error)).not.toContain("secret-value-that-must-not-leak");
    }
  });

  it("does not require DATABASE_URL", async () => {
    process.env.NOTION_API_KEY = "k";
    const { getNotionClientEnv } = await import("./env");
    expect(() => getNotionClientEnv()).not.toThrow();
  });

  it("does not expose an is-it-configured switch that could select placeholder content", async () => {
    const env = await import("./env");
    expect(Object.keys(env)).not.toContain("isNotionConfigured");
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
