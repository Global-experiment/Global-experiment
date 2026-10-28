import { Inject, Injectable } from "@nestjs/common";
import { and, eq, isNull, lt, ne, or, sql } from "drizzle-orm";
import { DATABASE, type Database } from "../common/database/database.module.js";
import { adminRolePermissions, adminRoles, adminSessions, adminUsers } from "./auth.schema.js";

export interface AdminUserRecord {
  id: string;
  email: string;
  role: string;
  status: string;
  passwordHash: string | null;
  displayName: string | null;
}

export interface SessionAdmin {
  id: string;
  email: string;
  role: string;
  roleLabel: string;
  displayName: string | null;
  accountNumber: number;
  timeZone: string | null;
  appearance: string;
  hasPicture: boolean;
  personId: string | null;
  permissions: string[];
}

export interface ActiveSessionRecord {
  sessionId: string;
  lastSeenAt: Date;
  expiresAt: Date;
  admin: SessionAdmin;
}

const permissionsOf = sql<string[]>`coalesce((select array_agg(${adminRolePermissions.permissionKey} order by ${adminRolePermissions.permissionKey}) from ${adminRolePermissions} where ${adminRolePermissions.roleKey} = ${adminUsers.role}), '{}')`;

@Injectable()
export class AuthRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async findAdminByEmail(email: string): Promise<AdminUserRecord | undefined> {
    const [row] = await this.db
      .select({
        id: adminUsers.id,
        email: adminUsers.email,
        role: adminUsers.role,
        status: adminUsers.status,
        passwordHash: adminUsers.passwordHash,
        displayName: adminUsers.displayName,
      })
      .from(adminUsers)
      .where(sql`lower(${adminUsers.email}) = ${email.toLowerCase()}`)
      .limit(1);
    return row;
  }

  async findAdminById(id: string, db: Pick<Database, "select"> = this.db): Promise<AdminUserRecord | undefined> {
    const [row] = await db
      .select({
        id: adminUsers.id,
        email: adminUsers.email,
        role: adminUsers.role,
        status: adminUsers.status,
        passwordHash: adminUsers.passwordHash,
        displayName: adminUsers.displayName,
      })
      .from(adminUsers)
      .where(eq(adminUsers.id, id))
      .limit(1);
    return row;
  }

  async createSession(adminUserId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.insert(adminSessions).values({ adminUserId, tokenHash, expiresAt });
      await tx.update(adminUsers).set({ lastLoginAt: new Date() }).where(eq(adminUsers.id, adminUserId));
      // Housekeeping: drop this admin's dead sessions (expired or revoked).
      await tx
        .delete(adminSessions)
        .where(
          and(
            eq(adminSessions.adminUserId, adminUserId),
            or(lt(adminSessions.expiresAt, new Date()), sql`${adminSessions.revokedAt} is not null`),
          ),
        );
    });
  }

  /** A live session of an ACTIVE account, with its role's permissions (an invited or deactivated account has none). */
  async findLiveSession(tokenHash: string): Promise<ActiveSessionRecord | undefined> {
    const [row] = await this.db
      .select({
        sessionId: adminSessions.id,
        lastSeenAt: adminSessions.lastSeenAt,
        expiresAt: adminSessions.expiresAt,
        id: adminUsers.id,
        email: adminUsers.email,
        role: adminUsers.role,
        roleLabel: adminRoles.label,
        displayName: adminUsers.displayName,
        accountNumber: adminUsers.accountNumber,
        timeZone: adminUsers.timeZone,
        appearance: adminUsers.appearance,
        pictureKey: adminUsers.pictureKey,
        personId: adminUsers.personId,
        permissions: permissionsOf,
      })
      .from(adminSessions)
      .innerJoin(adminUsers, eq(adminUsers.id, adminSessions.adminUserId))
      .innerJoin(adminRoles, eq(adminRoles.key, adminUsers.role))
      .where(and(eq(adminSessions.tokenHash, tokenHash), isNull(adminSessions.revokedAt), eq(adminUsers.status, "active")))
      .limit(1);
    if (!row) return undefined;
    return {
      sessionId: row.sessionId,
      lastSeenAt: row.lastSeenAt,
      expiresAt: row.expiresAt,
      admin: {
        id: row.id,
        email: row.email,
        role: row.role,
        roleLabel: row.roleLabel,
        displayName: row.displayName,
        accountNumber: row.accountNumber,
        timeZone: row.timeZone,
        appearance: row.appearance,
        hasPicture: row.pictureKey !== null,
        personId: row.personId,
        permissions: row.permissions ?? [],
      },
    };
  }

  async touchSession(sessionId: string, at: Date): Promise<void> {
    await this.db.update(adminSessions).set({ lastSeenAt: at }).where(eq(adminSessions.id, sessionId));
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.db
      .update(adminSessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(adminSessions.id, sessionId), isNull(adminSessions.revokedAt)));
  }

  /** Signs an account out everywhere — except, optionally, the session making the change. */
  async revokeSessionsOf(db: Pick<Database, "update">, adminUserId: string, keepSessionId?: string): Promise<void> {
    await db
      .update(adminSessions)
      .set({ revokedAt: new Date() })
      .where(
        and(eq(adminSessions.adminUserId, adminUserId), isNull(adminSessions.revokedAt), ...(keepSessionId ? [ne(adminSessions.id, keepSessionId)] : [])),
      );
  }

  /**
   * The set-owner command: makes the account with this email an active
   * Rootadmin with this password (creating it when there's none), and signs
   * it out everywhere. Other accounts are untouched (there can be several
   * Rootadmins since migration 0012).
   */
  async upsertOwner(email: string, passwordHash: string): Promise<"created" | "updated"> {
    return this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: adminUsers.id })
        .from(adminUsers)
        .where(sql`lower(${adminUsers.email}) = ${email.toLowerCase()}`)
        .limit(1);
      if (!existing) {
        await tx.insert(adminUsers).values({ email, passwordHash, role: "owner", status: "active" });
        return "created";
      }
      await tx
        .update(adminUsers)
        .set({ passwordHash, role: "owner", status: "active", deactivatedAt: null, updatedAt: new Date() })
        .where(eq(adminUsers.id, existing.id));
      await this.revokeSessionsOf(tx, existing.id);
      return "updated";
    });
  }
}
