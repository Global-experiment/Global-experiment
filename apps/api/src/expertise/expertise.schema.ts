import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

/**
 * Lookup vocabularies for the taxonomy (rows, not enums: a value is added
 * without a migration). Seeded by migration 0002: taxonomy status `active`
 * (the only value in the Notion data) and the six Teams. See
 * docs/architecture/data-model.md §4.
 */
const vocabularyColumns = {
  key: text("key").primaryKey(),
  label: text("label").notNull(),
  sortOrder: integer("sort_order").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
};

export const taxonomyStatuses = pgTable("taxonomy_statuses", vocabularyColumns, (table) => [
  check("taxonomy_statuses_key_shape", sql`${table.key} ~ '^[a-z][a-z0-9_]{0,39}$'`),
  check("taxonomy_statuses_label_present", sql`length(btrim(${table.label})) between 1 and 60`),
]);

/** Expertise → Teams (0..n). Recorded only: nothing routes or grants on it yet. */
export const teams = pgTable("teams", vocabularyColumns, (table) => [
  check("teams_key_shape", sql`${table.key} ~ '^[a-z][a-z0-9_]{0,39}$'`),
  check("teams_label_present", sql`length(btrim(${table.label})) between 1 and 60`),
]);

/**
 * Columns every taxonomy level shares with Notion: the Stable ID (format
 * checked per level), the Status, and the Notion page the row was imported
 * from (the import's first match key). All nullable: rows created in the
 * admin have none until they're matched to Notion.
 */
const notionColumns = () => ({
  stableId: text("stable_id"),
  statusKey: text("status_key").references(() => taxonomyStatuses.key, { onDelete: "restrict", onUpdate: "cascade" }),
  notionPageId: uuid("notion_page_id"),
});

/**
 * Expertise taxonomy: Domain → Field → Expertise. Names are unique among
 * siblings (case-insensitive), not globally — two domains may each have a
 * field called "Research". A parent with children can't be deleted
 * (`restrict`): removing taxonomy that people/organizations use is an
 * explicit editorial step, never a cascade.
 */
export const expertiseDomains = pgTable(
  "expertise_domains",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    ...notionColumns(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("expertise_domains_name_unique").on(sql`lower(${table.name})`),
    uniqueIndex("expertise_domains_stable_id_unique").on(table.stableId).where(sql`${table.stableId} is not null`),
    uniqueIndex("expertise_domains_notion_page_id_unique").on(table.notionPageId).where(sql`${table.notionPageId} is not null`),
    index("expertise_domains_status_key_idx").on(table.statusKey),
    check("expertise_domains_name_present", sql`length(btrim(${table.name})) between 1 and 120`),
    // domain.NN.slug — the one format all 14 Notion domains use (checked 2026-10-14, migration 0003).
    check("expertise_domains_stable_id_shape", sql`${table.stableId} is null or ${table.stableId} ~ '^domain\\.[0-9]{2}\\.[a-z0-9_]+$'`),
  ],
);

export const expertiseFields = pgTable(
  "expertise_fields",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    domainId: uuid("domain_id")
      .notNull()
      .references(() => expertiseDomains.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    ...notionColumns(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("expertise_fields_domain_name_unique").on(table.domainId, sql`lower(${table.name})`),
    uniqueIndex("expertise_fields_stable_id_unique").on(table.stableId).where(sql`${table.stableId} is not null`),
    uniqueIndex("expertise_fields_notion_page_id_unique").on(table.notionPageId).where(sql`${table.notionPageId} is not null`),
    index("expertise_fields_status_key_idx").on(table.statusKey),
    check("expertise_fields_name_present", sql`length(btrim(${table.name})) between 1 and 120`),
    check(
      "expertise_fields_stable_id_shape",
      sql`${table.stableId} is null or ${table.stableId} ~ '^field\\.[0-9]{2}\\.[0-9]{2}\\.[a-z0-9_]+$'`,
    ),
  ],
);

export const expertiseItems = pgTable(
  "expertise_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fieldId: uuid("field_id")
      .notNull()
      .references(() => expertiseFields.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    ...notionColumns(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("expertise_items_field_name_unique").on(table.fieldId, sql`lower(${table.name})`),
    index("expertise_items_name_idx").on(sql`lower(${table.name})`),
    uniqueIndex("expertise_items_stable_id_unique").on(table.stableId).where(sql`${table.stableId} is not null`),
    uniqueIndex("expertise_items_notion_page_id_unique").on(table.notionPageId).where(sql`${table.notionPageId} is not null`),
    index("expertise_items_status_key_idx").on(table.statusKey),
    check("expertise_items_name_present", sql`length(btrim(${table.name})) between 1 and 120`),
    check("expertise_items_stable_id_shape", sql`${table.stableId} is null or ${table.stableId} ~ '^[0-9]{2}\\.[0-9]{2}\\.[a-z0-9_]+$'`),
  ],
);

/** Expertise item ↔ Team. Deleting an item drops its team links; a team in use can't be deleted. */
export const expertiseTeams = pgTable(
  "expertise_teams",
  {
    expertiseId: uuid("expertise_id")
      .notNull()
      .references(() => expertiseItems.id, { onDelete: "cascade" }),
    teamKey: text("team_key")
      .notNull()
      .references(() => teams.key, { onDelete: "restrict", onUpdate: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ name: "expertise_teams_pk", columns: [table.expertiseId, table.teamKey] }),
    index("expertise_teams_team_key_idx").on(table.teamKey),
  ],
);
