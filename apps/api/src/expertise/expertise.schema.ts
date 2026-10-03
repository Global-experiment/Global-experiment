import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("expertise_domains_name_unique").on(sql`lower(${table.name})`),
    check("expertise_domains_name_present", sql`length(btrim(${table.name})) between 1 and 120`),
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("expertise_fields_domain_name_unique").on(table.domainId, sql`lower(${table.name})`),
    check("expertise_fields_name_present", sql`length(btrim(${table.name})) between 1 and 120`),
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("expertise_items_field_name_unique").on(table.fieldId, sql`lower(${table.name})`),
    index("expertise_items_name_idx").on(sql`lower(${table.name})`),
    check("expertise_items_name_present", sql`length(btrim(${table.name})) between 1 and 120`),
  ],
);
