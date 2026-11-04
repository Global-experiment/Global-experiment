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
    const offenders = files.filter((f) =>
      /@notionhq\/client|NOTION_(API_KEY|HOME_PAGE_ID|DOCUMENTATION_DB_ID)|integrations\/notion/.test(readFileSync(f, "utf8")),
    );
    expect(offenders).toEqual([]);
  });
});
