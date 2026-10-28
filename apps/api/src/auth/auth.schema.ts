import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";
import { people } from "../people/people.schema.js";

/**
 * Roles (overview §3.1, migration 0012): the owner ("Rootadmin") and the
 * team roles. A lookup, so a role is renamed or added without a release.
 */
export const adminRoles = pgTable("admin_roles", {
  key: text("key").primaryKey(),
  label: text("label").notNull(),
  sortOrder: integer("sort_order").notNull(),
});

/** Every `module.action` permission key (access-control/permissions.ts). */
export const adminPermissions = pgTable("admin_permissions", {
  key: text("key").primaryKey(),
  module: text("module").notNull(),
  description: text("description").notNull(),
});

/** Which role has which permission: the rights change with rows, not code. */
export const adminRolePermissions = pgTable(
  "admin_role_permissions",
  {
    roleKey: text("role_key")
      .notNull()
      .references(() => adminRoles.key, { onDelete: "cascade", onUpdate: "cascade" }),
    permissionKey: text("permission_key")
      .notNull()
      .references(() => adminPermissions.key, { onDelete: "cascade", onUpdate: "cascade" }),
  },
  (table) => [primaryKey({ name: "admin_role_permissions_pk", columns: [table.roleKey, table.permissionKey] })],
);

/**
 * Admin accounts. Since migration 0012 there can be several Rootadmins
 * (Figma p15); the last active one can never be deactivated or demoted (the
 * service refuses it, a trigger backs it up). An invited account has no
 * password until its invitee sets one; a deactivated one can't sign in and
 * keeps its name in the history (decision 14: deactivate, never delete).
 */
export const adminUsers = pgTable(
  "admin_users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Account ID, shown "GE-000001" (Figma p18). */
    accountNumber: integer("account_number").notNull().generatedByDefaultAsIdentity(),
    email: text("email").notNull(),
    role: text("role")
      .notNull()
      .default("owner")
      .references(() => adminRoles.key, { onDelete: "restrict", onUpdate: "cascade" }),
    status: text("status").notNull().default("active"),
    /** Null while invited (the invitee sets it). */
    passwordHash: text("password_hash"),
    /** Shown on the admin's user card; null = the part of the email before "@". */
    displayName: text("display_name"),
    /** Profile picture: an opaque storage key (files/file-storage.ts) and its sniffed type. */
    pictureKey: text("picture_key"),
    pictureType: text("picture_type"),
    /** IANA zone for dates; null = the browser's. */
    timeZone: text("time_zone"),
    appearance: text("appearance").notNull().default("system"),
    /** Admin-only note (the Accounts list's Note column). */
    note: text("note"),
    /** The person of the directory this account belongs to (expertise, access grants). */
    personId: uuid("person_id").references((): AnyPgColumn => people.id, { onDelete: "set null" }),
    invitedById: uuid("invited_by_id").references((): AnyPgColumn => adminUsers.id, { onDelete: "set null" }),
    deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("admin_users_email_unique").on(sql`lower(${table.email})`),
    uniqueIndex("admin_users_account_number_unique").on(table.accountNumber),
    uniqueIndex("admin_users_person_unique").on(table.personId),
    check("admin_users_email_shape", sql`${table.email} ~ '^[^@\\s]+@[^@\\s]+$'`),
    check(
      "admin_users_display_name_shape",
      sql`${table.displayName} is null or (char_length(${table.displayName}) between 1 and 80 and ${table.displayName} = btrim(${table.displayName}))`,
    ),
    check("admin_users_status_known", sql`${table.status} in ('active', 'invited', 'deactivated')`),
    check("admin_users_password_when_active", sql`${table.status} = 'invited' or ${table.passwordHash} is not null`),
    check("admin_users_appearance_known", sql`${table.appearance} in ('system', 'light', 'dark')`),
    check("admin_users_time_zone_shape", sql`${table.timeZone} is null or char_length(${table.timeZone}) between 1 and 64`),
    check("admin_users_note_length", sql`${table.note} is null or char_length(${table.note}) <= 2000`),
    check("admin_users_picture_type_known", sql`${table.pictureType} is null or ${table.pictureType} in ('image/png', 'image/jpeg', 'image/webp')`),
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

/**
 * One-time links (decision 13: no email server yet, the owner copies them):
 * an invitation sets the new account's password; a reset replaces a
 * forgotten one. Valid 72 hours, used once; only the SHA-256 of the token is
 * stored, and the token travels in the URL fragment so no server or proxy
 * log ever sees it.
 */
export const adminTokens = pgTable(
  "admin_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    adminUserId: uuid("admin_user_id")
      .notNull()
      .references(() => adminUsers.id, { onDelete: "cascade" }),
    purpose: text("purpose").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdById: uuid("created_by_id").references(() => adminUsers.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("admin_tokens_token_hash_unique").on(table.tokenHash),
    index("admin_tokens_admin_user_id_idx").on(table.adminUserId),
    check("admin_tokens_purpose_known", sql`${table.purpose} in ('invite', 'reset')`),
    check("admin_tokens_expiry_after_creation", sql`${table.expiresAt} > ${table.createdAt}`),
  ],
);
