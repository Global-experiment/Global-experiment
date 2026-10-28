import { sql } from "drizzle-orm";
import { bigint, boolean, check, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { adminUsers } from "../auth/auth.schema.js";
import type { AuditChange } from "./audit.types.js";

/**
 * The record types the platform audits (migration 0009). Text, not an
 * enum: a new module adds its type without a migration of this table.
 */
export const AUDITED_ENTITIES = ["person", "organization", "treasury_entry", "expertise_domain", "expertise_field", "expertise_item", "setting", "import_run", "service", "access_grant", "admin_user"] as const;
export type AuditedEntity = (typeof AUDITED_ENTITIES)[number];

/**
 * Append-only audit log (decisions 10–12 of 2026-10-19; data-model §11):
 * one row per write, written in the same transaction as the write, never
 * updated or deleted (a trigger refuses both). `changes` holds the field
 * differences ({field, kind, before, after}); `meta` the context (import
 * source, duplicated-from record, comment text). Never secrets: passwords,
 * tokens and keys aren't audited fields.
 *
 * `id` orders events (newest first = id desc); `occurred_at` is when.
 */
export const auditEvents = pgTable(
  "audit_events",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    /**
     * created · imported · duplicated · updated · archived · restored · deleted · comment_added · comment_edited · comment_deleted;
     * since 0012: access_granted · access_changed · access_revoked (on the person, the account and the service) ·
     * invited · activated · link_created · password_changed · email_changed · deactivated · reactivated (accounts) · permission_denied
     */
    action: text("action").notNull(),
    /** admin (a person signed in) or automation (imports, Stripe, scheduled jobs). */
    actorType: text("actor_type").notNull(),
    // Restrict: accounts are deactivated, never deleted (decision 14), and the log is never rewritten.
    actorId: uuid("actor_id").references(() => adminUsers.id, { onDelete: "restrict" }),
    /** The actor's name when the event was written (kept if the account goes away). */
    actorLabel: text("actor_label").notNull(),
    /** admin · import · stripe · system */
    source: text("source").notNull(),
    changes: jsonb("changes").$type<AuditChange[]>().notNull().default(sql`'[]'::jsonb`),
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  },
  (table) => [
    index("audit_events_entity_idx").on(table.entityType, table.entityId, table.id),
    index("audit_events_occurred_at_idx").on(table.occurredAt),
    index("audit_events_actor_idx").on(table.actorId),
    check("audit_events_entity_type_shape", sql`${table.entityType} ~ '^[a-z][a-z_]{1,39}$'`),
    check(
      "audit_events_action_known",
      sql`${table.action} in ('created', 'imported', 'duplicated', 'updated', 'archived', 'restored', 'deleted', 'comment_added', 'comment_edited', 'comment_deleted', 'access_granted', 'access_changed', 'access_revoked', 'invited', 'activated', 'link_created', 'password_changed', 'email_changed', 'deactivated', 'reactivated', 'permission_denied')`,
    ),
    check("audit_events_actor_type_known", sql`${table.actorType} in ('admin', 'automation')`),
    check("audit_events_actor_label_present", sql`length(btrim(${table.actorLabel})) between 1 and 120`),
    check("audit_events_source_known", sql`${table.source} in ('admin', 'import', 'stripe', 'system')`),
    check("audit_events_changes_array", sql`jsonb_typeof(${table.changes}) = 'array'`),
    check("audit_events_meta_object", sql`jsonb_typeof(${table.meta}) = 'object'`),
  ],
);

/**
 * Comments on a record (decision 10): any admin with access may comment;
 * authors edit or delete their own. Deleting keeps the row (deleted_at) and
 * every add/edit/delete is an audit event with the text, so the history
 * keeps what was said.
 */
export const recordComments = pgTable(
  "record_comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    authorId: uuid("author_id").references(() => adminUsers.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("record_comments_entity_idx").on(table.entityType, table.entityId, table.createdAt),
    check("record_comments_body_length", sql`length(btrim(${table.body})) between 1 and 5000`),
  ],
);

/**
 * Record views (decision 11): every opening counts; the history shows
 * "viewed this page" at most once per account per window
 * (history.view_event_window_hours, 24) — `in_history` marks those openings.
 */
export const recordViews = pgTable(
  "record_views",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    viewerId: uuid("viewer_id").references(() => adminUsers.id, { onDelete: "set null" }),
    viewedAt: timestamp("viewed_at", { withTimezone: true }).notNull().defaultNow(),
    inHistory: boolean("in_history").notNull().default(false),
  },
  (table) => [
    index("record_views_entity_idx").on(table.entityType, table.entityId, table.viewedAt),
    index("record_views_viewer_idx").on(table.viewerId, table.entityType, table.entityId, table.viewedAt),
  ],
);
