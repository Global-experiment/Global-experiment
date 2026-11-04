import { sql } from "drizzle-orm";
import { char, check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";
import { adminUsers } from "../auth/auth.schema.js";
import type { ContentBlock } from "./content.js";

/**
 * The native Home and Documentation (ADR 020, migration 0016; OPS-26/27/28).
 *
 * A document is the page (Home, or one Documentation article); its content
 * lives in revisions. Every save is a new revision — never an update of an
 * old one — with its author, time, content and an optional summary. The
 * revision the website shows is `published_revision_id`; the newest one is
 * `latest_revision_id` (a draft when they differ).
 *
 * Revisions go draft → published. The step a later delivery adds (an admin
 * submits, Superadmins validate) plugs in as more revision statuses between
 * the two, without changing these tables' shape.
 */
export const CMS_KINDS = ["home", "article"] as const;
export type CmsKind = (typeof CMS_KINDS)[number];
export const REVISION_STATUSES = ["draft", "published"] as const;
export type RevisionStatus = (typeof REVISION_STATUSES)[number];

export const cmsDocuments = pgTable(
  "cms_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Shown "DOC-3" in the admin. */
    documentNumber: integer("document_number").notNull().generatedByDefaultAsIdentity(),
    kind: text("kind").notNull(),
    /** Documentation's order (Display order); 0 for Home. */
    displayOrder: integer("display_order").notNull().default(0),
    latestRevisionId: uuid("latest_revision_id").references((): AnyPgColumn => cmsRevisions.id, { onDelete: "restrict" }),
    publishedRevisionId: uuid("published_revision_id").references((): AnyPgColumn => cmsRevisions.id, { onDelete: "restrict" }),
    /** The first publication ("Published" on the website); kept when a new revision is published. */
    firstPublishedAt: timestamp("first_published_at", { withTimezone: true }),
    /** Taken off the website after being published ("Unpublished"). */
    unpublishedAt: timestamp("unpublished_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    /** Where the first revision came from ("notion:<page id>" for the one-time import), so the import never runs twice. */
    sourceRef: text("source_ref"),
    createdById: uuid("created_by_id").references(() => adminUsers.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("cms_documents_number_unique").on(table.documentNumber),
    // One Home.
    uniqueIndex("cms_documents_one_home")
      .on(table.kind)
      .where(sql`${table.kind} = 'home'`),
    uniqueIndex("cms_documents_source_ref_unique").on(table.sourceRef),
    index("cms_documents_kind_order_idx").on(table.kind, table.displayOrder),
    check("cms_documents_kind_known", sql`${table.kind} in ('home', 'article')`),
    check("cms_documents_display_order_range", sql`${table.displayOrder} between -100000 and 100000`),
    check("cms_documents_unpublished_not_live", sql`${table.unpublishedAt} is null or ${table.publishedRevisionId} is null`),
  ],
);

export const cmsRevisions = pgTable(
  "cms_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => cmsDocuments.id, { onDelete: "restrict" }),
    /** 1, 2, 3… per document ("Version 3"). */
    number: integer("number").notNull(),
    status: text("status").notNull().default("draft"),
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    /** Documentation's expertise tags (up to 10). */
    expertise: jsonb("expertise")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    content: jsonb("content").$type<ContentBlock[]>().notNull(),
    /** What changed, in the author's words (optional). */
    summary: text("summary"),
    authorId: uuid("author_id").references(() => adminUsers.id, { onDelete: "set null" }),
    /** The author's name when saved ("Notion import" for the first revisions), kept if the account goes away. */
    authorLabel: text("author_label").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    publishedById: uuid("published_by_id").references(() => adminUsers.id, { onDelete: "set null" }),
    publishedByLabel: text("published_by_label"),
    /** A restored version: the revision it copies (restoring makes a new revision, ADR 020). */
    restoredFromId: uuid("restored_from_id").references((): AnyPgColumn => cmsRevisions.id, { onDelete: "restrict" }),
    /** SHA-256 of the content, to tell an unchanged save from a real one. */
    contentHash: char("content_hash", { length: 64 }).notNull(),
  },
  (table) => [
    uniqueIndex("cms_revisions_document_number_unique").on(table.documentId, table.number),
    index("cms_revisions_document_idx").on(table.documentId, table.createdAt),
    check("cms_revisions_status_known", sql`${table.status} in ('draft', 'published')`),
    check("cms_revisions_number_positive", sql`${table.number} >= 1`),
    check("cms_revisions_title_length", sql`char_length(btrim(${table.title})) between 1 and 200`),
    check("cms_revisions_slug_shape", sql`${table.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(${table.slug}) <= 100`),
    check("cms_revisions_expertise_array", sql`jsonb_typeof(${table.expertise}) = 'array' and jsonb_array_length(${table.expertise}) <= 10`),
    check("cms_revisions_content_array", sql`jsonb_typeof(${table.content}) = 'array'`),
    check("cms_revisions_summary_length", sql`${table.summary} is null or char_length(${table.summary}) <= 500`),
    check("cms_revisions_author_label_present", sql`char_length(btrim(${table.authorLabel})) between 1 and 120`),
    check("cms_revisions_published_when_published", sql`(${table.status} = 'published') = (${table.publishedAt} is not null)`),
    check("cms_revisions_content_hash_hex", sql`${table.contentHash} ~ '^[0-9a-f]{64}$'`),
  ],
);

/** 5 MB; PNG, JPEG, WebP or GIF, judged from the bytes (never SVG: it can carry script). */
export const CMS_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const CMS_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;

/**
 * Images of Home and Documentation, in the file storage (content-addressed,
 * never deleted — ADR 017). Public only once a published revision uses
 * them; until then only the admins with cms.read see them.
 */
export const cmsImages = pgTable(
  "cms_images",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storageKey: text("storage_key").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sha256: char("sha256", { length: 64 }).notNull(),
    /** As uploaded (admins only); the website shows the block's description instead. */
    fileName: text("file_name").notNull(),
    uploadedById: uuid("uploaded_by_id").references(() => adminUsers.id, { onDelete: "set null" }),
    /** "Notion import" for the imported images. */
    uploadedByLabel: text("uploaded_by_label").notNull(),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // The same image uploaded twice is one image.
    uniqueIndex("cms_images_sha256_unique").on(table.sha256),
    check("cms_images_content_type_known", sql`${table.contentType} in ('image/png', 'image/jpeg', 'image/webp', 'image/gif')`),
    check("cms_images_size_range", sql`${table.sizeBytes} between 1 and ${sql.raw(String(CMS_IMAGE_MAX_BYTES))}`),
    check("cms_images_sha256_hex", sql`${table.sha256} ~ '^[0-9a-f]{64}$'`),
    check("cms_images_file_name_present", sql`char_length(btrim(${table.fileName})) between 1 and 255`),
  ],
);
