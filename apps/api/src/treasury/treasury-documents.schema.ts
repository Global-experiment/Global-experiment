import { sql } from "drizzle-orm";
import { char, check, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { adminUsers } from "../auth/auth.schema.js";
import { treasuryEntries } from "./treasury.schema.js";

/** 20 MB (docs/architecture/overview.md §3.4; retention is Q5). */
export const DOCUMENT_MAX_BYTES = 20 * 1024 * 1024;
export const DOCUMENT_CONTENT_TYPES = ["application/pdf", "image/png", "image/jpeg"] as const;
export type DocumentContentType = (typeof DOCUMENT_CONTENT_TYPES)[number];

/**
 * Supporting documents of a Treasury entry (invoices, receipts) —
 * data-model.md §4.3, migration 0007. Private entirely: the bytes live in the
 * file storage (storage_key, never a path), served only to authorized admins.
 */
export const treasuryDocuments = pgTable(
  "treasury_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entryId: uuid("entry_id")
      .notNull()
      .references(() => treasuryEntries.id, { onDelete: "restrict" }),
    /** As uploaded, shown only to admins. */
    fileName: text("file_name").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sha256: char("sha256", { length: 64 }).notNull(),
    /** Opaque key for the storage adapter (local disk today, S3-compatible later); derived from sha256, shared by identical files. */
    storageKey: text("storage_key").notNull(),
    uploadedByAdminId: uuid("uploaded_by_admin_id").references(() => adminUsers.id, { onDelete: "set null" }),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("treasury_documents_entry_idx").on(table.entryId, table.uploadedAt),
    // The same file twice on one entry is one document.
    uniqueIndex("treasury_documents_entry_sha256_unique").on(table.entryId, table.sha256),
    // Content-addressed storage (named by SHA-256): one stored file may back the same receipt on several entries.
    index("treasury_documents_storage_key_idx").on(table.storageKey),
    check("treasury_documents_file_name_present", sql`length(btrim(${table.fileName})) between 1 and 255`),
    check("treasury_documents_content_type_known", sql`${table.contentType} in ('application/pdf', 'image/png', 'image/jpeg')`),
    check("treasury_documents_size_range", sql`${table.sizeBytes} between 1 and ${sql.raw(String(DOCUMENT_MAX_BYTES))}`),
    check("treasury_documents_sha256_hex", sql`${table.sha256} ~ '^[0-9a-f]{64}$'`),
    check("treasury_documents_storage_key_shape", sql`${table.storageKey} ~ '^[a-z0-9][a-z0-9/._-]{0,254}$'`),
  ],
);
