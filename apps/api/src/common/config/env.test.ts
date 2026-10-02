import { describe, expect, it } from "vitest";
import { EnvValidationError, parseConfig } from "./env.js";

const base = { DATABASE_URL: "postgres://fake_user@localhost:5432/fake_db" };

describe("parseConfig", () => {
  it("applies safe development defaults", () => {
    const config = parseConfig({ ...base });
    expect(config).toMatchObject({
      nodeEnv: "development",
      host: "127.0.0.1",
      port: 4000,
      cookieSecure: false,
      session: { idleMinutes: 480, maxDays: 7 },
      trustProxyHops: 0,
    });
  });

  it("requires DATABASE_URL and never echoes values in the error", () => {
    expect(() => parseConfig({ DATABASE_URL: "not-a-url-with-secret-xyz" })).toThrow(EnvValidationError);
    try {
      parseConfig({ DATABASE_URL: "not-a-url-with-secret-xyz" });
    } catch (error) {
      expect(String((error as Error).message)).toContain("DATABASE_URL");
      expect(String((error as Error).message)).not.toContain("secret-xyz");
    }
  });

  it("rejects non-postgres connection strings", () => {
    expect(() => parseConfig({ DATABASE_URL: "mysql://localhost/db" })).toThrow(EnvValidationError);
  });

  it("requires an explicit admin origin allow-list in production and forces secure cookies", () => {
    expect(() => parseConfig({ ...base, NODE_ENV: "production" })).toThrow(/ADMIN_ALLOWED_ORIGINS/);
    expect(() =>
      parseConfig({ ...base, NODE_ENV: "production", ADMIN_ALLOWED_ORIGINS: "https://globalexperiment.org", COOKIE_SECURE: "false" }),
    ).toThrow(/COOKIE_SECURE/);
    const config = parseConfig({ ...base, NODE_ENV: "production", ADMIN_ALLOWED_ORIGINS: "https://globalexperiment.org/" });
    expect(config.cookieSecure).toBe(true);
    expect(config.adminAllowedOrigins).toEqual(["https://globalexperiment.org"]);
  });
});
