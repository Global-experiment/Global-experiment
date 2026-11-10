import { createHash } from "node:crypto";
import { mkdtemp, readdir, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { auditEvents } from "../audit/audit.schema.js";
import { adminUserPictures, adminUsers } from "../auth/auth.schema.js";
import { LocalDiskStorage } from "../files/file-storage.js";
import { createTestDatabase } from "../testing/test-app.js";
import { treasuryDocuments } from "../treasury/treasury-documents.schema.js";
import { treasuryEntries } from "../treasury/treasury.schema.js";
import { ACTOR, formatDocumentsPlan, planDocumentsPurge, purgeTreasuryDocuments, storedFilePath, verifiedBackupRefusal } from "./treasury-documents-purge.js";

/** The one-time deletion of Treasury documents (OPS-155, ADR 021). Fixtures in this file only. */
const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

async function setup() {
  const { db, close } = await createTestDatabase();
  const root = await mkdtemp(join(tmpdir(), "ge-purge-docs-"));
  closers.push(close, () => rm(root, { recursive: true, force: true }));
  const storage = new LocalDiskStorage(root);
  const entry = async (entryType: "expense" | "donation", grossAmount: number) =>
    (
      await db
        .insert(treasuryEntries)
        .values({
          managedBy: "native",
          entryType,
          name: entryType === "expense" ? "Accounting" : "A gift",
          currency: "EUR",
          grossAmount,
          cadence: "one_off",
          source: "manual",
          occurredOn: "2026-10-01",
          reviewStatusKey: entryType === "expense" ? "unqualified" : "not_required",
        })
        .returning()
    )[0]!;
  const attach = async (entryId: string, bytes: Buffer, fileName: string) => {
    const stored = await storage.put(bytes);
    await db
      .insert(treasuryDocuments)
      .values({ entryId, fileName, contentType: "application/pdf", sizeBytes: bytes.length, sha256: stored.sha256, storageKey: stored.key });
    return stored.key;
  };
  const files = async () => (await readdir(root, { recursive: true })).filter((name) => /[0-9a-f]{64}$/.test(String(name)));
  return { db, root, storage, entry, attach, files };
}

const pdf = (text: string) => Buffer.from(`%PDF-1.7\n${text}\n%%EOF\n`);

describe("one-time deletion of Treasury documents (ADR 021)", () => {
  it("plans with counts only: documents per entry type, entries, files, bytes, and the files another record shares", async () => {
    const { db, entry, attach } = await setup();
    const expense = await entry("expense", -1000);
    const gift = await entry("donation", 1000);
    await attach(expense.id, pdf("invoice"), "Invoice Ada Lovelace.pdf");
    await attach(expense.id, pdf("receipt"), "Receipt.pdf");
    await attach(gift.id, pdf("receipt"), "Same receipt.pdf");
    const plan = await planDocumentsPurge(db);
    expect(plan).toMatchObject({ documents: 3, byEntryType: { expense: 2, donation: 1 }, entries: 2, files: 2, sharedFiles: 0 });
    const text = formatDocumentsPlan(plan, "DRY RUN");
    expect(text).toContain("documents (rows): 3 (1 on donation entries, 2 on expense entries)");
    expect(text).not.toMatch(/Ada|Invoice|Receipt|\.pdf/);
  });

  it("deletes every row and the files nothing else uses, records it on each entry, and does nothing a second time", async () => {
    const { db, root, storage, entry, attach, files } = await setup();
    const expense = await entry("expense", -1000);
    const other = await entry("expense", -200);
    await attach(expense.id, pdf("invoice"), "Invoice.pdf");
    const sharedKey = await attach(other.id, pdf("photo"), "Scan.pdf");
    // The same bytes are also someone's profile picture: that file stays.
    const [owner] = await db.insert(adminUsers).values({ email: "picture@example.org", role: "treasury", status: "active", passwordHash: "x" }).returning();
    await db.insert(adminUserPictures).values({ adminUserId: owner!.id, storageKey: sharedKey, contentType: "image/png" });
    expect(await files()).toHaveLength(2);

    const done = await purgeTreasuryDocuments(db, root, new Date("2026-11-10T12:00:00Z"));
    expect(done).toMatchObject({ documents: 2, entries: 2, files: 1, sharedFiles: 1, filesDeleted: 1, filesAlreadyMissing: 0 });
    expect(await db.select().from(treasuryDocuments)).toEqual([]);
    expect(await files()).toHaveLength(1);
    expect(await storage.exists(sharedKey)).toBe(true);

    const events = await db.select().from(auditEvents).where(eq(auditEvents.entityId, expense.id));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      action: "updated",
      actorType: "automation",
      actorLabel: ACTOR.label,
      source: "system",
      changes: [{ field: "documents", kind: "relation", before: [{ label: "Invoice.pdf" }], after: [] }],
      meta: { origin: "purge-treasury-documents", adr: "021" },
    });
    // The entries themselves stay.
    expect(await db.select({ id: treasuryEntries.id }).from(treasuryEntries)).toHaveLength(2);

    const again = await purgeTreasuryDocuments(db, root);
    expect(again).toMatchObject({ documents: 0, entries: 0, files: 0, filesDeleted: 0 });
    expect((await db.select().from(auditEvents).where(eq(auditEvents.entityId, expense.id))).length).toBe(1);
  });

  it("counts a file already gone instead of failing", async () => {
    const { db, root, entry, attach } = await setup();
    const key = await attach((await entry("expense", -100)).id, pdf("gone"), "Gone.pdf");
    await rm(storedFilePath(root, key));
    expect(await purgeTreasuryDocuments(db, root)).toMatchObject({ filesDeleted: 0, filesAlreadyMissing: 1 });
  });

  it("runs only with a fresh pg_dump backup whose SHA-256 matches the one verified", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ge-backup-"));
    closers.push(() => rm(dir, { recursive: true, force: true }));
    const dump = join(dir, "ge-prod.dump");
    const bytes = Buffer.from("PGDMP\x01\x0e\x00 a custom-format archive");
    await writeFile(dump, bytes);
    const sha = createHash("sha256").update(bytes).digest("hex");
    expect(verifiedBackupRefusal(undefined, sha)).toMatch(/backup file is required/);
    expect(verifiedBackupRefusal(join(dir, "missing.dump"), sha)).toMatch(/doesn't exist/);
    expect(verifiedBackupRefusal(dump, undefined)).toMatch(/verified SHA-256 is required/);
    expect(verifiedBackupRefusal(dump, "f".repeat(64))).toMatch(/isn't the verified backup/);
    expect(verifiedBackupRefusal(dump, sha)).toBeUndefined();
    const text = join(dir, "notes.txt");
    await writeFile(text, "not a dump");
    expect(verifiedBackupRefusal(text, createHash("sha256").update("not a dump").digest("hex"))).toMatch(/not a pg_dump custom-format archive/);
    const old = new Date(Date.now() - 30 * 3_600_000);
    await utimes(dump, old, old);
    expect(verifiedBackupRefusal(dump, sha)).toMatch(/hours old/);
  });

  it("never resolves a storage key outside the storage directory", () => {
    expect(() => storedFilePath("/srv/files", "../etc/passwd")).toThrow("Invalid storage key.");
    expect(() => storedFilePath("/srv/files", "sha256/aa/../../x")).toThrow("Invalid storage key.");
    expect(storedFilePath("/srv/files", `sha256/ab/${"ab".repeat(32)}`)).toContain(`${"ab".repeat(32)}`);
  });
});
