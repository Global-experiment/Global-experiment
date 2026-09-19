import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

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
});
