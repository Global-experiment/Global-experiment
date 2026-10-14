import { sql } from "drizzle-orm";
import { check, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { adminUsers } from "../auth/auth.schema.js";

/**
 * Typed settings and feature flags (docs/architecture/data-model.md §1.1).
 * A missing row means "use the key's environment default" (settings.registry.ts),
 * so a fresh database needs no seed. Values are validated in code against the
 * key's declared type; every change is meant to be audited (module 2).
 */
export const settings = pgTable(
  "settings",
  {
    key: text("key").primaryKey(),
    value: jsonb("value").notNull(),
    updatedByAdminId: uuid("updated_by_admin_id").references(() => adminUsers.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [check("settings_key_shape", sql`${table.key} ~ '^[a-z][a-z0-9_]*(\\.[a-z0-9_]+)+$'`)],
);
