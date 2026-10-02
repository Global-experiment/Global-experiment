import { Inject, Injectable } from "@nestjs/common";
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { DATABASE, type Database } from "../common/database/database.module.js";
import { adminSessions, adminUsers } from "./auth.schema.js";

export interface AdminUserRecord {
  id: string;
  email: string;
  role: string;
  passwordHash: string;
}

export interface ActiveSessionRecord {
  sessionId: string;
  lastSeenAt: Date;
  expiresAt: Date;
  admin: { id: string; email: string; role: string };
}

@Injectable()
export class AuthRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async findAdminByEmail(email: string): Promise<AdminUserRecord | undefined> {
    const [row] = await this.db
      .select({ id: adminUsers.id, email: adminUsers.email, role: adminUsers.role, passwordHash: adminUsers.passwordHash })
      .from(adminUsers)
      .where(sql`lower(${adminUsers.email}) = ${email.toLowerCase()}`)
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

  async findLiveSession(tokenHash: string): Promise<ActiveSessionRecord | undefined> {
    const [row] = await this.db
      .select({
        sessionId: adminSessions.id,
        lastSeenAt: adminSessions.lastSeenAt,
        expiresAt: adminSessions.expiresAt,
        adminId: adminUsers.id,
        email: adminUsers.email,
        role: adminUsers.role,
      })
      .from(adminSessions)
      .innerJoin(adminUsers, eq(adminUsers.id, adminSessions.adminUserId))
      .where(and(eq(adminSessions.tokenHash, tokenHash), isNull(adminSessions.revokedAt)))
      .limit(1);
    if (!row) return undefined;
    return {
      sessionId: row.sessionId,
      lastSeenAt: row.lastSeenAt,
      expiresAt: row.expiresAt,
      admin: { id: row.adminId, email: row.email, role: row.role },
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

  /**
   * Creates the single owner, or replaces its email/password. Every
   * existing session is revoked so a password change logs out everywhere.
   */
  async upsertOwner(email: string, passwordHash: string): Promise<"created" | "updated"> {
    return this.db.transaction(async (tx) => {
      const [owner] = await tx.select({ id: adminUsers.id }).from(adminUsers).where(eq(adminUsers.role, "owner")).limit(1);
      if (!owner) {
        await tx.insert(adminUsers).values({ email, passwordHash, role: "owner" });
        return "created";
      }
      await tx.update(adminUsers).set({ email, passwordHash, updatedAt: new Date() }).where(eq(adminUsers.id, owner.id));
      await tx
        .update(adminSessions)
        .set({ revokedAt: new Date() })
        .where(and(eq(adminSessions.adminUserId, owner.id), isNull(adminSessions.revokedAt)));
      return "updated";
    });
  }
}
