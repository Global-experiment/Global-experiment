import { sql } from "drizzle-orm";
import { check, index, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { expertiseItems } from "../expertise/expertise.schema.js";

/**
 * Organizations. Names are deliberately NOT unique: the future Notion
 * import keeps duplicates visible instead of merging them silently.
 * `website` and `note` are the minimal directory fields; Figma has no
 * Organizations frame yet, so nothing beyond them is assumed.
 */
export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    website: text("website"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("organizations_name_idx").on(sql`lower(${table.name})`),
    index("organizations_created_at_idx").on(table.createdAt),
    index("organizations_updated_at_idx").on(table.updatedAt),
    check("organizations_name_present", sql`length(btrim(${table.name})) between 1 and 200`),
    check("organizations_website_length", sql`${table.website} is null or length(${table.website}) <= 2048`),
    check("organizations_note_length", sql`${table.note} is null or length(${table.note}) <= 5000`),
  ],
);

/** Organization ↔ Expertise. Deleting an organization drops its tags; an expertise in use can't be deleted. */
export const organizationExpertise = pgTable(
  "organization_expertise",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    expertiseId: uuid("expertise_id")
      .notNull()
      .references(() => expertiseItems.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ name: "organization_expertise_pk", columns: [table.organizationId, table.expertiseId] }),
    index("organization_expertise_expertise_id_idx").on(table.expertiseId),
  ],
);
