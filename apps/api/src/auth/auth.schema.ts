import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

/**
 * Admin identities. v0.1 has exactly one owner (Candide) — enforced by a
 * partial unique index, not only by application code — but the table keeps
 * a role column so a later role can be added without restructuring.
 */
export const adminUsers = pgTable(
  "admin_users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    role: text("role").notNull().default("owner"),
    passwordHash: text("password_hash").notNull(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("admin_users_email_unique").on(sql`lower(${table.email})`),
    uniqueIndex("admin_users_single_owner").on(table.role).where(sql`${table.role} = 'owner'`),
    check("admin_users_role_known", sql`${table.role} in ('owner')`),
    check("admin_users_email_shape", sql`${table.email} ~ '^[^@\\s]+@[^@\\s]+$'`),
  ],
);

/**
 * Server-side sessions. Only a SHA-256 of the opaque cookie token is stored,
 * so a database read never yields a usable session.
 */
export const adminSessions = pgTable(
  "admin_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    adminUserId: uuid("admin_user_id")
      .notNull()
      .references(() => adminUsers.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("admin_sessions_token_hash_unique").on(table.tokenHash),
    index("admin_sessions_admin_user_id_idx").on(table.adminUserId),
    check("admin_sessions_expiry_after_creation", sql`${table.expiresAt} > ${table.createdAt}`),
  ],
);
