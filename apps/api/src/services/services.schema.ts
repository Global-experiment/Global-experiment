import { sql } from "drizzle-orm";
import { check, date, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { adminUsers } from "../auth/auth.schema.js";
import { people } from "../people/people.schema.js";

/**
 * Services and access grants (admin-desktop.pdf p16–p17, migration 0013).
 * The lookups are seeded vocabulary (the Figma's values), never demo rows:
 * services and grants start empty and are entered in the admin.
 */
const lookup = (name: string) =>
  pgTable(name, {
    key: text("key").primaryKey(),
    label: text("label").notNull(),
    sortOrder: integer("sort_order").notNull(),
  });

export const serviceStatuses = lookup("service_statuses");
export const serviceCategories = lookup("service_categories");
export const serviceHostingModels = lookup("service_hosting_models");
export const accessLevels = lookup("access_levels");
export const accessStatuses = lookup("access_statuses");

export const services = pgTable(
  "services",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Service ID (Figma p16). */
    serviceNumber: integer("service_number").notNull().generatedByDefaultAsIdentity(),
    name: text("name").notNull(),
    statusKey: text("status_key").references(() => serviceStatuses.key, { onDelete: "restrict", onUpdate: "cascade" }),
    categoryKey: text("category_key").references(() => serviceCategories.key, { onDelete: "restrict", onUpdate: "cascade" }),
    hostingModelKey: text("hosting_model_key").references(() => serviceHostingModels.key, { onDelete: "restrict", onUpdate: "cascade" }),
    url: text("url"),
    description: text("description"),
    /** Decision 5: the admin account responsible for the service. */
    responsibleAdminId: uuid("responsible_admin_id").references(() => adminUsers.id, { onDelete: "set null" }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    archivedById: uuid("archived_by_id").references(() => adminUsers.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("services_service_number_unique").on(table.serviceNumber),
    index("services_archived_at_idx").on(table.archivedAt),
    check("services_name_present", sql`length(btrim(${table.name})) between 1 and 200`),
    check("services_url_length", sql`${table.url} is null or length(${table.url}) <= 2048`),
    check("services_description_length", sql`${table.description} is null or length(${table.description}) <= 5000`),
  ],
);

/**
 * Access grants (Figma p17 "Permissions"): who (a person of the directory,
 * decision 5, optionally their admin account) has which level on which
 * service, its status, scope and dates.
 */
export const accessGrants = pgTable(
  "access_grants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** The grant's ID (Figma p17). */
    grantNumber: integer("grant_number").notNull().generatedByDefaultAsIdentity(),
    /** Optional own name; shown as "<service> / <level>" when empty. */
    name: text("name"),
    personId: uuid("person_id").references(() => people.id, { onDelete: "restrict" }),
    adminUserId: uuid("admin_user_id").references(() => adminUsers.id, { onDelete: "set null" }),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "restrict" }),
    levelKey: text("level_key").references(() => accessLevels.key, { onDelete: "restrict", onUpdate: "cascade" }),
    statusKey: text("status_key").references(() => accessStatuses.key, { onDelete: "restrict", onUpdate: "cascade" }),
    resourceScope: text("resource_scope"),
    grantedOn: date("granted_on"),
    revokedOn: date("revoked_on"),
    expiresOn: date("expires_on"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    archivedById: uuid("archived_by_id").references(() => adminUsers.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("access_grants_grant_number_unique").on(table.grantNumber),
    index("access_grants_person_id_idx").on(table.personId),
    index("access_grants_admin_user_id_idx").on(table.adminUserId),
    index("access_grants_service_id_idx").on(table.serviceId),
    index("access_grants_archived_at_idx").on(table.archivedAt),
    check("access_grants_name_length", sql`${table.name} is null or length(btrim(${table.name})) between 1 and 200`),
    check("access_grants_scope_length", sql`${table.resourceScope} is null or length(${table.resourceScope}) <= 1000`),
    check("access_grants_revoked_after_granted", sql`${table.grantedOn} is null or ${table.revokedOn} is null or ${table.grantedOn} <= ${table.revokedOn}`),
    check("access_grants_expires_after_granted", sql`${table.grantedOn} is null or ${table.expiresOn} is null or ${table.grantedOn} <= ${table.expiresOn}`),
  ],
);
