import { createHash } from "node:crypto";
import { openSync, readSync, closeSync, readFileSync } from "node:fs";
import { unlink } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { count, eq, inArray } from "drizzle-orm";
import { recordAuditEvent, type Executor } from "../audit/audit.service.js";
import { entryLabel } from "../audit/entity-labels.js";
import { adminUserPictures } from "../auth/auth.schema.js";
import { cmsImages } from "../cms/cms.schema.js";
import type { Database } from "../common/database/database.module.js";
import { treasuryDocuments } from "../treasury/treasury-documents.schema.js";
import { treasuryEntries } from "../treasury/treasury.schema.js";
import { backupRefusal } from "./demo-data-purge.js";

/**
 * The ONE permitted exception to archive-only (ADR 017), recorded in ADR 021
 * (OPS-155, asked by the client on 2026-11-10): Treasury supporting documents
 * left the platform — accountants keep them outside it — and the ones already
 * attached are permanently deleted, rows and files, once. Nothing else may
 * delete these rows or any stored file (archive-only.test.ts).
 *
 * - Plan (dry run, the default): counts only — documents per entry type,
 *   entries, files and bytes; no names.
 * - Run: only with a database backup taken in the last 24 hours AND its
 *   verified SHA-256. In one transaction: one History event per entry ("removed
 *   its supporting documents", as an "updated" change of Documents), then the
 *   rows. After the commit, the stored files no profile picture or CMS image
 *   shares (storage is content-addressed): those stay.
 *   Copies remain in the existing backups until the retention rule removes them.
 */

export const ACTOR = { type: "automation" as const, label: "One-time document deletion (OPS-155)" };

const KEY = /^sha256\/[0-9a-f]{2}\/[0-9a-f]{64}$/;

export interface DocumentsPlan {
  documents: number;
  byEntryType: Record<string, number>;
  entries: number;
  files: number;
  /** Files another kind of record also uses (a profile picture or a CMS image): kept. */
  sharedFiles: number;
  bytes: number;
}

export async function planDocumentsPurge(db: Executor): Promise<DocumentsPlan & { fileKeys: string[] }> {
  const rows = await db
    .select({ entryId: treasuryDocuments.entryId, entryType: treasuryEntries.entryType, key: treasuryDocuments.storageKey, size: treasuryDocuments.sizeBytes })
    .from(treasuryDocuments)
    .innerJoin(treasuryEntries, eq(treasuryEntries.id, treasuryDocuments.entryId));
  const keys = [...new Set(rows.map((row) => row.key))];
  const shared = new Set<string>();
  if (keys.length > 0) {
    for (const row of await db.select({ key: adminUserPictures.storageKey }).from(adminUserPictures).where(inArray(adminUserPictures.storageKey, keys)))
      shared.add(row.key);
    for (const row of await db.select({ key: cmsImages.storageKey }).from(cmsImages).where(inArray(cmsImages.storageKey, keys))) shared.add(row.key);
  }
  const byEntryType: Record<string, number> = {};
  for (const row of rows) byEntryType[row.entryType] = (byEntryType[row.entryType] ?? 0) + 1;
  const sizeOf = new Map(rows.map((row) => [row.key, row.size]));
  const fileKeys = keys.filter((key) => !shared.has(key));
  return {
    documents: rows.length,
    byEntryType,
    entries: new Set(rows.map((row) => row.entryId)).size,
    files: fileKeys.length,
    sharedFiles: shared.size,
    bytes: fileKeys.reduce((total, key) => total + (sizeOf.get(key) ?? 0), 0),
    fileKeys,
  };
}

/** Counts only: no file names, no entry names. */
export function formatDocumentsPlan(plan: DocumentsPlan, heading: string): string {
  const types = Object.entries(plan.byEntryType)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([type, n]) => `${n} on ${type} entries`);
  return [
    heading,
    `documents (rows): ${plan.documents}${types.length > 0 ? ` (${types.join(", ")})` : ""}`,
    `entries with documents: ${plan.entries}`,
    `stored files to delete: ${plan.files} (${plan.bytes} bytes)`,
    `stored files kept (also a profile picture or a CMS image): ${plan.sharedFiles}`,
  ].join("\n");
}

/** A verified backup: fresh (≤ 24 hours), not empty, a pg_dump custom-format archive, and exactly the SHA-256 recorded for it. */
export function verifiedBackupRefusal(path: string | undefined, sha256: string | undefined, now = Date.now()): string | undefined {
  const basic = backupRefusal(path, now);
  if (basic) return basic;
  if (!sha256 || !/^[0-9a-f]{64}$/.test(sha256)) return "the backup's verified SHA-256 is required: --sha256 <64 hex characters>.";
  const head = Buffer.alloc(5);
  const fd = openSync(path!, "r");
  try {
    readSync(fd, head, 0, 5, 0);
  } finally {
    closeSync(fd);
  }
  if (head.toString("latin1") !== "PGDMP") return `backup file "${path}" is not a pg_dump custom-format archive.`;
  const actual = createHash("sha256").update(readFileSync(path!)).digest("hex");
  if (actual !== sha256) return `backup file "${path}" doesn't match the SHA-256 given: it isn't the verified backup.`;
  return undefined;
}

/** The path of a stored file, refusing any key that could point outside the storage directory. */
export function storedFilePath(root: string, key: string): string {
  if (!KEY.test(key)) throw new Error("Invalid storage key.");
  // resolve(): absolute either way, in this system's own separators (so the containment check below holds).
  const base = resolve(process.cwd(), root);
  const path = join(base, ...key.split("/"));
  if (!path.startsWith(base + sep)) throw new Error("Invalid storage key.");
  return path;
}

export interface DocumentsPurged extends DocumentsPlan {
  filesDeleted: number;
  filesAlreadyMissing: number;
}

/** Deletes every Treasury document row (one transaction, with History events), then the files no other record uses. */
export async function purgeTreasuryDocuments(db: Database, storageRoot: string, at = new Date()): Promise<DocumentsPurged> {
  const plan = await db.transaction(async (tx) => {
    const planned = await planDocumentsPurge(tx);
    const documents = await tx
      .select({ id: treasuryDocuments.id, entryId: treasuryDocuments.entryId, fileName: treasuryDocuments.fileName })
      .from(treasuryDocuments);
    const entryIds = [...new Set(documents.map((row) => row.entryId))];
    const entries = entryIds.length > 0 ? await tx.select().from(treasuryEntries).where(inArray(treasuryEntries.id, entryIds)) : [];
    for (const entry of entries) {
      const before = documents.filter((row) => row.entryId === entry.id).map((row) => ({ id: row.id, label: row.fileName }));
      await recordAuditEvent(
        tx,
        {
          entityType: "treasury_entry",
          entityId: entry.id,
          action: "updated",
          actor: ACTOR,
          source: "system",
          changes: [{ field: "documents", label: "Documents", kind: "relation", before, after: [] }],
          meta: { label: entryLabel(entry), origin: "purge-treasury-documents", adr: "021" },
        },
        at,
      );
    }
    // The one documented exception to archive-only (ADR 021).
    await tx.delete(treasuryDocuments);
    const [left] = await tx.select({ n: count() }).from(treasuryDocuments);
    if ((left?.n ?? 0) !== 0) throw new Error("Documents are left after the deletion; nothing was changed.");
    return planned;
  });

  let filesDeleted = 0;
  let filesAlreadyMissing = 0;
  for (const key of plan.fileKeys) {
    // Checked again after the commit: a picture or an image uploaded meanwhile keeps its file.
    const [pictures] = await db.select({ n: count() }).from(adminUserPictures).where(eq(adminUserPictures.storageKey, key));
    const [images] = await db.select({ n: count() }).from(cmsImages).where(eq(cmsImages.storageKey, key));
    if ((pictures?.n ?? 0) + (images?.n ?? 0) > 0) continue;
    try {
      await unlink(storedFilePath(storageRoot, key));
      filesDeleted++;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") filesAlreadyMissing++;
      else throw error;
    }
  }
  return {
    documents: plan.documents,
    byEntryType: plan.byEntryType,
    entries: plan.entries,
    files: plan.files,
    sharedFiles: plan.sharedFiles,
    bytes: plan.bytes,
    filesDeleted,
    filesAlreadyMissing,
  };
}
