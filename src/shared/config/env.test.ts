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

describe("getEnv", () => {
  it("throws a descriptive error when required variables are missing", async () => {
    const { getEnv, EnvValidationError } = await import("./env");
    expect(() => getEnv()).toThrow(EnvValidationError);
  });

  it("parses successfully when all required variables are present", async () => {
    process.env.DATABASE_URL = "postgres://user:pass@localhost:5432/db";
    process.env.NOTION_API_KEY = "secret_abc";
    process.env.NOTION_DOCUMENTATION_DB_ID = "db-id-123";

    const { getEnv } = await import("./env");
    const env = getEnv();
    expect(env.NOTION_DOCUMENTATION_DB_ID).toBe("db-id-123");
  });

  it("caches the parsed result across calls", async () => {
    process.env.DATABASE_URL = "postgres://user:pass@localhost:5432/db";
    process.env.NOTION_API_KEY = "secret_abc";
    process.env.NOTION_DOCUMENTATION_DB_ID = "db-id-123";

    const { getEnv } = await import("./env");
    const first = getEnv();
    process.env.NOTION_DOCUMENTATION_DB_ID = "changed";
    const second = getEnv();
    expect(second).toBe(first);
  });
});
