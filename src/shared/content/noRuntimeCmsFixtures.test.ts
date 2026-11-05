import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guard (ADR 009, ADR 020): the running website shows only the content the
 * native API publishes. Scans runtime (non-test) source for fixture or mock
 * CMS repositories, static Home copy, and any remaining Notion runtime.
 * (Sample pages exist for tests and local setup only, in the API's
 * testing/fixtures, which is never part of a build.)
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
const apiSrcDir = path.resolve(import.meta.dirname, "../../../apps/api/src");
/** The Notion SDK, its API host, any NOTION_* setting, or the old integration folder. */
const NOTION_RUNTIME = /@notionhq\/client|api\.notion\.com|NOTION_[A-Z_]+|integrations\/notion/;

describe("no CMS fixtures in the running application", () => {
  it("has no fixture/mock/placeholder-named runtime files", () => {
    const offenders = files.filter((f) => /fixture|mock|placeholder|home-content/i.test(path.basename(f)));
    expect(offenders).toEqual([]);
  });

  it("has no runtime code selecting a fixture repository", () => {
    const offenders = files.filter((f) => /FixtureDocumentationRepository|FixtureHomeRepository|home-content/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("no longer reads Home or Documentation from Notion (Delivery 6)", () => {
    const offenders = files.filter((f) => NOTION_RUNTIME.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("has no Notion setting or client left in the API either, now that the one-time import is gone", () => {
    const offenders = runtimeSourceFiles(apiSrcDir).filter((f) => NOTION_RUNTIME.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});
