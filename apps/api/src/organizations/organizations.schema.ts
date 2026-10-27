import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { adminUsers } from "../auth/auth.schema.js";
import { expertiseItems } from "../expertise/expertise.schema.js";

/**
 * Organizations, mapped from the Notion "0.1 native" Organizations database
 * (docs/architecture/data-model.md §3). Names and emails are deliberately
 * NOT unique: the import keeps duplicates visible instead of merging them
 * silently. `org_number` is Notion's Organization ID (`ORG-n`, prefix added
 * on display); `notion_page_id` is the import's first match key.
 */
export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgNumber: integer("org_number").notNull().generatedByDefaultAsIdentity(),
    notionPageId: uuid("notion_page_id"),
    name: text("name").notNull(),
    description: text("description"),
    website: text("website"),
    email: text("email"),
    wiseRecipientId: text("wise_recipient_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    /** Archived (decision 12): left out of the default views, listed under "Archived", restorable. */
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    archivedById: uuid("archived_by_id").references(() => adminUsers.id, { onDelete: "set null" }),
  },
  (table) => [
    index("organizations_name_idx").on(sql`lower(${table.name})`),
    index("organizations_email_idx").on(sql`lower(${table.email})`),
    index("organizations_created_at_idx").on(table.createdAt),
    index("organizations_updated_at_idx").on(table.updatedAt),
    index("organizations_archived_at_idx").on(table.archivedAt),
    uniqueIndex("organizations_org_number_unique").on(table.orgNumber),
    uniqueIndex("organizations_notion_page_id_unique").on(table.notionPageId).where(sql`${table.notionPageId} is not null`),
    check("organizations_org_number_positive", sql`${table.orgNumber} > 0`),
    check("organizations_name_present", sql`length(btrim(${table.name})) between 1 and 200`),
    check("organizations_website_length", sql`${table.website} is null or length(${table.website}) <= 2048`),
    check("organizations_description_length", sql`${table.description} is null or length(${table.description}) <= 5000`),
    // Same rule as people.email.
    check(
      "organizations_email_shape",
      sql`${table.email} is null or (${table.email} ~ '^[^@\\s]+@[^@\\s]+$' and length(${table.email}) <= 320)`,
    ),
    check(
      "organizations_wise_recipient_id_length",
      sql`${table.wiseRecipientId} is null or length(${table.wiseRecipientId}) between 1 and 100`,
    ),
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
    /** The order shown on the record (drag and drop, 2026-10-22); 0 = first. */
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ name: "organization_expertise_pk", columns: [table.organizationId, table.expertiseId] }),
    index("organization_expertise_expertise_id_idx").on(table.expertiseId),
  ],
);
