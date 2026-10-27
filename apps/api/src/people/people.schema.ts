import { sql } from "drizzle-orm";
import { boolean, check, date, index, integer, pgTable, primaryKey, smallint, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { adminUsers } from "../auth/auth.schema.js";
import { expertiseItems } from "../expertise/expertise.schema.js";
import { organizations } from "../organizations/organizations.schema.js";

/**
 * State and Source vocabularies are lookup tables, not PostgreSQL enums:
 * the client's lists aren't final (Figma evidences Sourced / Contacted /
 * Collaborating and "Candide"), and a lookup row can be added, relabelled
 * or reordered without a destructive migration. People reference the
 * stable `key`; `label` is display text and `sort_order` gives "State
 * ascending" a lifecycle order instead of an alphabetical one.
 */
const vocabularyColumns = {
  key: text("key").primaryKey(),
  label: text("label").notNull(),
  sortOrder: integer("sort_order").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
};

export const personStates = pgTable("person_states", vocabularyColumns, (table) => [
  check("person_states_key_shape", sql`${table.key} ~ '^[a-z][a-z0-9_]{0,39}$'`),
  check("person_states_label_present", sql`length(btrim(${table.label})) between 1 and 60`),
]);

export const personSources = pgTable("person_sources", vocabularyColumns, (table) => [
  check("person_sources_key_shape", sql`${table.key} ~ '^[a-z][a-z0-9_]{0,39}$'`),
  check("person_sources_label_present", sql`length(btrim(${table.label})) between 1 and 60`),
]);

/**
 * People, mapped from the Notion "0.1 native" People database
 * (docs/architecture/data-model.md §2). Figma's "Access grant" and
 * "Expenses" columns are later modules. Names and emails are NOT unique —
 * duplicates stay visible (import rule), never merged silently. No hard
 * delete endpoint exists yet (retention undecided).
 *
 * `person_number` is Notion's Person ID (`PER-n`, prefix added on display):
 * assigned automatically for people created in the admin, set explicitly
 * by the import. `notion_page_id` is the import's first match key.
 */
export const people = pgTable(
  "people",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personNumber: integer("person_number").notNull().generatedByDefaultAsIdentity(),
    notionPageId: uuid("notion_page_id"),
    name: text("name").notNull(),
    stateKey: text("state_key").references(() => personStates.key, { onDelete: "restrict", onUpdate: "cascade" }),
    sourceKey: text("source_key").references(() => personSources.key, { onDelete: "restrict", onUpdate: "cascade" }),
    description: text("description"),
    doNotContact: boolean("do_not_contact").notNull().default(false),
    email: text("email"),
    phone: text("phone"),
    website: text("website"),
    linkedin: text("linkedin"),
    x: text("x"),
    otherContact: text("other_contact"),
    wiseRecipientId: text("wise_recipient_id"),
    /**
     * Notion's Follow-up date: the NEXT planned follow-up, date AND time
     * (person-record prototype, 2026-10-21). Replaced next_followup_on in
     * 0010: a date-only value became that day at 09:00 Europe/Zurich.
     */
    nextFollowupAt: timestamp("next_followup_at", { withTimezone: true }),
    /** First and last contact: date-only, never converted between time zones. */
    firstContactOn: date("first_contact_on", { mode: "string" }),
    lastContactOn: date("last_contact_on", { mode: "string" }),
    /** Whole scores 0–10 (decision 7); the AI score becomes read-only once ai.enabled. */
    aiRelevanceScore: smallint("ai_relevance_score"),
    relevanceScore: smallint("relevance_score"),
    /** "Other socials" (Figma p14): one more profile link. */
    otherSocials: text("other_socials"),
    /** Archived (decision 12): left out of the default views, listed under "Archived", restorable. */
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    archivedById: uuid("archived_by_id").references(() => adminUsers.id, { onDelete: "set null" }),

    /**
     * Values of the former `last_followup_at` column (0001), whose meaning
     * was "last follow-up" — kept as they were, never converted into
     * `next_followup_on`. Read-only.
     */
    lastFollowupAtLegacy: timestamp("last_followup_at_legacy", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("people_name_idx").on(sql`lower(${table.name})`),
    index("people_email_idx").on(sql`lower(${table.email})`),
    index("people_state_key_idx").on(table.stateKey),
    index("people_source_key_idx").on(table.sourceKey),
    index("people_created_at_idx").on(table.createdAt),
    index("people_updated_at_idx").on(table.updatedAt),
    uniqueIndex("people_person_number_unique").on(table.personNumber),
    uniqueIndex("people_notion_page_id_unique").on(table.notionPageId).where(sql`${table.notionPageId} is not null`),
    check("people_person_number_positive", sql`${table.personNumber} > 0`),
    check("people_relevance_scores_range", sql`(${table.aiRelevanceScore} is null or ${table.aiRelevanceScore} between 0 and 10) and (${table.relevanceScore} is null or ${table.relevanceScore} between 0 and 10)`),
    check("people_other_socials_length", sql`${table.otherSocials} is null or length(${table.otherSocials}) between 1 and 2048`),
    check("people_contact_dates_order", sql`${table.firstContactOn} is null or ${table.lastContactOn} is null or ${table.firstContactOn} <= ${table.lastContactOn}`),
    index("people_next_followup_at_idx").on(table.nextFollowupAt),
    index("people_archived_at_idx").on(table.archivedAt),
    check("people_wise_recipient_id_length", sql`${table.wiseRecipientId} is null or length(${table.wiseRecipientId}) between 1 and 100`),
    check("people_name_present", sql`length(btrim(${table.name})) between 1 and 200`),
    check("people_email_shape", sql`${table.email} is null or ${table.email} ~ '^[^@\\s]+@[^@\\s]+$'`),
    check("people_description_length", sql`${table.description} is null or length(${table.description}) <= 5000`),
    check(
      "people_contact_lengths",
      sql`coalesce(length(${table.email}), 0) <= 320 and coalesce(length(${table.phone}), 0) <= 64
        and coalesce(length(${table.website}), 0) <= 2048 and coalesce(length(${table.linkedin}), 0) <= 2048
        and coalesce(length(${table.x}), 0) <= 2048 and coalesce(length(${table.otherContact}), 0) <= 500`,
    ),
  ],
);

/** Person ↔ Organization (many-to-many). Deleting either side drops the link only. */
export const peopleOrganizations = pgTable(
  "people_organizations",
  {
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** The order shown on the record (drag and drop, 2026-10-22); 0 = first. */
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ name: "people_organizations_pk", columns: [table.personId, table.organizationId] }),
    index("people_organizations_organization_id_idx").on(table.organizationId),
  ],
);

/** Person ↔ Expertise. Deleting a person drops their tags; an expertise in use can't be deleted. */
export const peopleExpertise = pgTable(
  "people_expertise",
  {
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    expertiseId: uuid("expertise_id")
      .notNull()
      .references(() => expertiseItems.id, { onDelete: "restrict" }),
    /** The order shown on the record (drag and drop, 2026-10-22); 0 = first. */
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ name: "people_expertise_pk", columns: [table.personId, table.expertiseId] }),
    index("people_expertise_expertise_id_idx").on(table.expertiseId),
  ],
);

/**
 * Contact channels (decision 8 of 2026-10-19): an admin-editable lookup,
 * seeded with Email, Phone, WhatsApp, Signal, Telegram, LinkedIn, X, Matrix
 * and Workana; a person lists the channels they can be reached on.
 */
export const contactChannels = pgTable("contact_channels", vocabularyColumns, (table) => [
  check("contact_channels_key_shape", sql`${table.key} ~ '^[a-z][a-z0-9_]{0,39}$'`),
  check("contact_channels_label_present", sql`length(btrim(${table.label})) between 1 and 60`),
]);

export const personContactChannels = pgTable(
  "person_contact_channels",
  {
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    channelKey: text("channel_key")
      .notNull()
      .references(() => contactChannels.key, { onDelete: "restrict", onUpdate: "cascade" }),
    /** The order shown on the record (drag and drop, 2026-10-22); 0 = first. */
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ name: "person_contact_channels_pk", columns: [table.personId, table.channelKey] })],
);
