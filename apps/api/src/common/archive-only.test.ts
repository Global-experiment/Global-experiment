import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guard (ADR 017, archive only): comments, Treasury supporting documents,
 * profile pictures and the CMS's documents, revisions and images are
 * archived and restored, never deleted. No runtime code may delete their
 * rows (Drizzle or SQL), and the file storage has no way to delete a file.
 * The demo and test-data purge scripts are the only exception (scripts/,
 * run by hand with a backup; they never touch these tables' real rows).
 */
const SRC = resolve(import.meta.dirname, "..");
const runtimeFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return ["testing", "scripts"].includes(entry.name) && dir === SRC ? [] : runtimeFiles(full);
    return /\.ts$/.test(entry.name) && !/\.test\.ts$/.test(entry.name) ? [full] : [];
  });

const TABLES = {
  recordComments: "record_comments",
  treasuryDocuments: "treasury_documents",
  adminUserPictures: "admin_user_pictures",
  cmsDocuments: "cms_documents",
  cmsRevisions: "cms_revisions",
  cmsImages: "cms_images",
};

describe("archive only: nothing archivable is ever hard-deleted", () => {
  const files = runtimeFiles(SRC);

  it("scans the runtime source", () => {
    expect(files.length).toBeGreaterThan(50);
    expect(files.some((file) => file.endsWith(join("cms", "cms.service.ts")))).toBe(true);
  });

  it.each(Object.entries(TABLES))("no runtime code deletes from %s", (name, table) => {
    const pattern = new RegExp(`\\.delete\\(\\s*${name}\\b|delete\\s+from\\s+"?${table}\\b`, "i");
    const offenders = files.filter((file) => pattern.test(readFileSync(file, "utf8"))).map((file) => relative(SRC, file));
    expect(offenders).toEqual([]);
  });

  it("the file storage can store and read, never delete", () => {
    const storage = readFileSync(join(SRC, "files", "file-storage.ts"), "utf8");
    const contract = storage.slice(storage.indexOf("export interface FileStorage"), storage.indexOf("}", storage.indexOf("export interface FileStorage")));
    expect(contract).toMatch(/put\(/);
    expect(contract).not.toMatch(/delete|remove|unlink/i);
    expect(storage).not.toMatch(/\b(unlink|rm|rmdir)\s*\(/);
  });
});
