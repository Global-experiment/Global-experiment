import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { notionMissingLocally } from "@/shared/config/env";

/**
 * Guard: the running application must only ever use live Notion content.
 * Scans runtime (non-test) source for fixture/mock CMS repositories,
 * static Home copy, and runtime "is Notion configured?" switches.
 */
function runtimeSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return runtimeSourceFiles(full);
    if (!/\.(ts|tsx)$/.test(entry.name)) return [];
    if (/\.(test|spec)\.(ts|tsx)$/.test(entry.name)) return [];
    return [full];
  });
}

const srcDir = path.resolve(import.meta.dirname, "../..");
const files = runtimeSourceFiles(srcDir);

describe("no CMS fixtures in the running application", () => {
  it("has no fixture/mock/placeholder-named runtime files", () => {
    const offenders = files.filter((f) => /fixture|mock|placeholder|home-content/i.test(path.basename(f)));
    expect(offenders).toEqual([]);
  });

  it("has no runtime code selecting a fixture repository or checking whether Notion is configured", () => {
    const offenders = files.filter((f) => {
      const text = readFileSync(f, "utf8");
      return /FixtureDocumentationRepository|FixtureHomeRepository|isNotionConfigured|home-content/.test(text);
    });
    expect(offenders).toEqual([]);
  });

  // ADR 009, amended 2026-11-03: the one exception is a contributor's machine without Notion,
  // which shows a "not connected" notice (no content) — and never in production.
  it("shows the local 'Notion isn't connected' notice only outside production", () => {
    vi.stubEnv("NOTION_API_KEY", "");
    vi.stubEnv("NOTION_HOME_PAGE_ID", "");
    vi.stubEnv("NODE_ENV", "development");
    expect(notionMissingLocally("home")).toBe(true);
    expect(notionMissingLocally("documentation")).toBe(true);
    vi.stubEnv("NODE_ENV", "production");
    expect(notionMissingLocally("home")).toBe(false);
    expect(notionMissingLocally("documentation")).toBe(false);
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NOTION_API_KEY", "set");
    vi.stubEnv("NOTION_HOME_PAGE_ID", "set");
    expect(notionMissingLocally("home")).toBe(false);
    vi.unstubAllEnvs();
  });
});
