import { sql } from "drizzle-orm";
import { boolean, check, date, index, integer, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
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
    personalNote: text("personal_note"),
    doNotContact: boolean("do_not_contact").notNull().default(false),
    email: text("email"),
    phone: text("phone"),
    website: text("website"),
    linkedin: text("linkedin"),
    x: text("x"),
    otherContact: text("other_contact"),
    wiseRecipientId: text("wise_recipient_id"),
    /** Notion's Follow-up date: the NEXT planned follow-up. */
    nextFollowupOn: date("next_followup_on", { mode: "string" }),
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
    index("people_next_followup_on_idx").on(table.nextFollowupOn),
    uniqueIndex("people_person_number_unique").on(table.personNumber),
    uniqueIndex("people_notion_page_id_unique").on(table.notionPageId).where(sql`${table.notionPageId} is not null`),
    check("people_person_number_positive", sql`${table.personNumber} > 0`),
    check("people_wise_recipient_id_length", sql`${table.wiseRecipientId} is null or length(${table.wiseRecipientId}) between 1 and 100`),
    check("people_name_present", sql`length(btrim(${table.name})) between 1 and 200`),
    check("people_email_shape", sql`${table.email} is null or ${table.email} ~ '^[^@\\s]+@[^@\\s]+$'`),
    check("people_personal_note_length", sql`${table.personalNote} is null or length(${table.personalNote}) <= 5000`),
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ name: "people_expertise_pk", columns: [table.personId, table.expertiseId] }),
    index("people_expertise_expertise_id_idx").on(table.expertiseId),
  ],
);
