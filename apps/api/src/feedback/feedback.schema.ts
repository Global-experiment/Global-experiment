import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, numeric, pgTable, primaryKey, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { adminUsers } from "../auth/auth.schema.js";
import { expertiseItems } from "../expertise/expertise.schema.js";

/**
 * Feedbacks and issues (data-model §6, migrations 0019–0020): what visitors send from the public composers, and
 * how the admins qualify it. Nothing here is public (client, 2026-11-23). No IP address or other identifier of the
 * sender is stored: the rate limit keeps the address in memory only.
 */

export const SUBMISSION_KINDS = ["feedback", "issue"] as const;
export type SubmissionKind = (typeof SUBMISSION_KINDS)[number];

/** A submission's decision: Roadmap item or Discarded; none = new. Archiving is the archive action, not a status. */
export const submissionStatuses = pgTable(
  "submission_statuses",
  {
    key: text("key").primaryKey(),
    label: text("label").notNull(),
    sortOrder: integer("sort_order").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("submission_statuses_key_shape", sql`${table.key} ~ '^[a-z][a-z0-9_]{0,39}$'`),
    check("submission_statuses_label_present", sql`length(btrim(${table.label})) between 1 and 60`),
  ],
);

/** The 6 feedback types and 9 issue types of the composers (Figma p12–p13), each tied to its kind. */
export const submissionTypes = pgTable(
  "submission_types",
  {
    key: text("key").primaryKey(),
    kind: text("kind").notNull(),
    label: text("label").notNull(),
    description: text("description").notNull(),
    sortOrder: integer("sort_order").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // What the composite foreign keys point to: a type of this kind.
    unique("submission_types_key_kind_unique").on(table.key, table.kind),
    check("submission_types_key_shape", sql`${table.key} ~ '^[a-z][a-z0-9_]{0,39}$'`),
    check("submission_types_kind_known", sql`${table.kind} in ('feedback', 'issue')`),
    check("submission_types_label_present", sql`length(btrim(${table.label})) between 1 and 60`),
    check("submission_types_description_length", sql`length(${table.description}) <= 200`),
  ],
);

export const submissions = pgTable(
  "submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** "Feedback issue ID" (Figma). */
    submissionNumber: integer("submission_number").notNull().generatedByDefaultAsIdentity(),
    /** Feedback or issue now: an admin may reclassify it. */
    kind: text("kind").notNull(),
    /** What the visitor chose; never changes. */
    submittedKind: text("submitted_kind").notNull(),
    /** "Submission text". */
    body: text("body").notNull(),
    /** The page the visitor came from: a same-site path, sanitised as on the site. */
    sourcePage: text("source_page"),
    locale: text("locale"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
    externalSubmissionId: text("external_submission_id"),
    // Filled by the automatic qualification later (Q12): empty until then.
    translation: text("translation"),
    botScore: numeric("bot_score", { precision: 4, scale: 3, mode: "number" }),
    aiSignificanceScore: numeric("ai_significance_score", { precision: 3, scale: 1, mode: "number" }),
    aiComment: text("ai_comment"),
    aiNote: text("ai_note"),
    // The admins' qualification.
    typeKey: text("type_key"),
    statusKey: text("status_key").references(() => submissionStatuses.key, { onDelete: "restrict", onUpdate: "cascade" }),
    significanceScore: numeric("significance_score", { precision: 3, scale: 1, mode: "number" }),
    decisionComment: text("decision_comment"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    /** "Last edited at": changes only when an admin edits. */
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    archivedById: uuid("archived_by_id").references(() => adminUsers.id, { onDelete: "set null" }),
  },
  (table) => [
    uniqueIndex("submissions_submission_number_unique").on(table.submissionNumber),
    uniqueIndex("submissions_external_submission_id_unique")
      .on(table.externalSubmissionId)
      .where(sql`${table.externalSubmissionId} is not null`),
    // What the visitor's picks point to: the submission as it was sent.
    unique("submissions_id_submitted_kind_unique").on(table.id, table.submittedKind),
    // The admins' type belongs to the submission's current kind (no type passes).
    foreignKey({ name: "submissions_type_of_kind_fk", columns: [table.typeKey, table.kind], foreignColumns: [submissionTypes.key, submissionTypes.kind] })
      .onDelete("restrict")
      .onUpdate("cascade"),
    index("submissions_submitted_at_idx").on(table.submittedAt.desc()),
    index("submissions_kind_idx").on(table.kind),
    index("submissions_status_key_idx").on(table.statusKey),
    index("submissions_type_key_idx").on(table.typeKey),
    index("submissions_archived_at_idx").on(table.archivedAt),
    check("submissions_submission_number_positive", sql`${table.submissionNumber} > 0`),
    check("submissions_kind_known", sql`${table.kind} in ('feedback', 'issue')`),
    check("submissions_submitted_kind_known", sql`${table.submittedKind} in ('feedback', 'issue')`),
    check("submissions_body_length", sql`length(btrim(${table.body})) between 1 and 5000`),
    check(
      "submissions_source_page_shape",
      sql`${table.sourcePage} is null or (length(${table.sourcePage}) between 1 and 300 and left(${table.sourcePage}, 1) = '/' and left(${table.sourcePage}, 2) <> '//')`,
    ),
    check(
      "submissions_locale_shape",
      sql`${table.locale} is null or (length(${table.locale}) <= 35 and ${table.locale} ~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{1,8})*$')`,
    ),
    check("submissions_external_id_length", sql`${table.externalSubmissionId} is null or length(${table.externalSubmissionId}) between 1 and 255`),
    check("submissions_translation_length", sql`${table.translation} is null or length(${table.translation}) <= 20000`),
    check("submissions_bot_score_range", sql`${table.botScore} is null or ${table.botScore} between 0 and 1`),
    check("submissions_ai_significance_range", sql`${table.aiSignificanceScore} is null or ${table.aiSignificanceScore} between 0 and 10`),
    check("submissions_ai_comment_length", sql`${table.aiComment} is null or length(${table.aiComment}) <= 500`),
    check("submissions_ai_note_length", sql`${table.aiNote} is null or length(${table.aiNote}) <= 5000`),
    check("submissions_significance_range", sql`${table.significanceScore} is null or ${table.significanceScore} between 0 and 10`),
    check("submissions_decision_comment_length", sql`${table.decisionComment} is null or length(${table.decisionComment}) <= 5000`),
  ],
);

/** The types the visitor picked, kept as sent: only types of the kind they chose (composite foreign keys). */
export const submissionTypeLinks = pgTable(
  "submission_type_links",
  {
    submissionId: uuid("submission_id").notNull(),
    kind: text("kind").notNull(),
    typeKey: text("type_key").notNull(),
  },
  (table) => [
    primaryKey({ name: "submission_type_links_pk", columns: [table.submissionId, table.typeKey] }),
    foreignKey({
      name: "submission_type_links_submission_fk",
      columns: [table.submissionId, table.kind],
      foreignColumns: [submissions.id, submissions.submittedKind],
    }).onDelete("restrict"),
    foreignKey({ name: "submission_type_links_type_fk", columns: [table.typeKey, table.kind], foreignColumns: [submissionTypes.key, submissionTypes.kind] })
      .onDelete("restrict")
      .onUpdate("cascade"),
    index("submission_type_links_type_key_idx").on(table.typeKey),
  ],
);

/** The expertise an admin routes a submission to (up to 10, in the admin's order). */
export const submissionExpertise = pgTable(
  "submission_expertise",
  {
    submissionId: uuid("submission_id")
      .notNull()
      .references(() => submissions.id, { onDelete: "restrict" }),
    expertiseId: uuid("expertise_id")
      .notNull()
      .references(() => expertiseItems.id, { onDelete: "restrict" }),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ name: "submission_expertise_pk", columns: [table.submissionId, table.expertiseId] }),
    index("submission_expertise_expertise_id_idx").on(table.expertiseId),
  ],
);
