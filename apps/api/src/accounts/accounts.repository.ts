import { Inject, Injectable } from "@nestjs/common";
import { aliasedTable, and, asc, desc, eq, gt, inArray, isNull, not, or, sql, type SQL } from "drizzle-orm";
import { adminInvitations, adminRoles, adminTokens, adminUserExpertise, adminUsers } from "../auth/auth.schema.js";
import { DATABASE, type Database } from "../common/database/database.module.js";
import type { Page, Sort } from "../common/listing/list-query.js";
import { expertiseRefsByOwner } from "../expertise/expertise-refs.js";
import { ServicesRepository, accountName } from "../services/services.repository.js";
import type { AccountDto, AccountSortField, AccountsListQuery, InvitationDto, ProfileDto } from "./accounts.contracts.js";

export type Executor = Pick<Database, "select" | "insert" | "update" | "delete">;

/** "GE-000001": the account number on six digits (Figma p18). */
export const formatAccountId = (accountNumber: number) => `GE-${String(accountNumber).padStart(6, "0")}`;

const contains = (text: string) => `%${text.replace(/[\\%_]/g, (match) => `\\${match}`)}%`;

const inviter = aliasedTable(adminUsers, "inviter");
const invitee = aliasedTable(adminUsers, "invitee");

@Injectable()
export class AccountsRepository {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly services: ServicesRepository,
  ) {}

  private select(db: Executor = this.db) {
    return db
      .select({
        id: adminUsers.id,
        accountNumber: adminUsers.accountNumber,
        email: adminUsers.email,
        displayName: adminUsers.displayName,
        name: accountName(adminUsers),
        roleKey: adminUsers.role,
        roleLabel: adminRoles.label,
        status: adminUsers.status,
        description: adminUsers.description,
        pictureKey: adminUsers.pictureKey,
        timeZone: adminUsers.timeZone,
        appearance: adminUsers.appearance,
        lastLoginAt: adminUsers.lastLoginAt,
        deactivatedAt: adminUsers.deactivatedAt,
        createdAt: adminUsers.createdAt,
        updatedAt: adminUsers.updatedAt,
      })
      .from(adminUsers)
      .leftJoin(adminRoles, eq(adminRoles.key, adminUsers.role));
  }

  async list(query: AccountsListQuery): Promise<Page<AccountDto>> {
    const conditions: (SQL | undefined)[] = [];
    if (query.search?.trim()) {
      const pattern = contains(query.search.trim());
      conditions.push(
        or(
          sql`${accountName(adminUsers)} ilike ${pattern}`,
          sql`${adminUsers.email} ilike ${pattern}`,
          sql`${adminUsers.description} ilike ${pattern}`,
          sql`${adminRoles.label} ilike ${pattern}`,
        ),
      );
    }
    const anyOf = new Map<string, SQL[]>();
    for (const filter of query.filters) {
      const value = String(filter.value);
      // Role "none": no role yet (OPS-141).
      const matches = filter.field === "status" ? eq(adminUsers.status, value) : value === "none" ? isNull(adminUsers.role) : eq(adminUsers.role, value);
      if (filter.operator === "is") anyOf.set(filter.field, [...(anyOf.get(filter.field) ?? []), matches]);
      else conditions.push(filter.field === "role" && value !== "none" ? or(isNull(adminUsers.role), not(matches)) : not(matches));
    }
    for (const options of anyOf.values()) conditions.push(or(...options));
    const where = and(...conditions);
    const expression: Record<AccountSortField, SQL> = {
      name: sql`lower(${accountName(adminUsers)})`,
      number: sql`${adminUsers.accountNumber}`,
      role: sql`${adminRoles.sortOrder}`,
      email: sql`lower(${adminUsers.email})`,
      status: sql`${adminUsers.status}`,
      lastLogin: sql`${adminUsers.lastLoginAt}`,
      created: sql`${adminUsers.createdAt}`,
    };
    const order = (query.sort as Sort<AccountSortField>[]).map(({ field, direction }) => sql`${expression[field]} ${sql.raw(direction)} nulls last`);
    const [rows, [count]] = await Promise.all([
      this.select()
        .where(where)
        .orderBy(...order, asc(adminUsers.id))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize),
      this.db
        .select({ total: sql<number>`count(*)::int` })
        .from(adminUsers)
        .leftJoin(adminRoles, eq(adminRoles.key, adminUsers.role))
        .where(where),
    ]);
    return { items: await this.hydrate(rows), page: query.page, pageSize: query.pageSize, total: count?.total ?? 0 };
  }

  async find(id: string, db: Executor = this.db): Promise<AccountDto | undefined> {
    const [account] = await this.hydrate(await this.select(db).where(eq(adminUsers.id, id)).limit(1), db);
    return account;
  }

  async findProfile(id: string, db: Executor = this.db): Promise<(Omit<ProfileDto, "permissionKeys"> & { pictureKey: string | null }) | undefined> {
    const rows = await this.select(db).where(eq(adminUsers.id, id)).limit(1);
    const [account] = await this.hydrate(rows, db);
    const row = rows[0];
    if (!account || !row) return undefined;
    return { ...account, timeZone: row.timeZone, appearance: row.appearance as ProfileDto["appearance"], pictureKey: row.pictureKey };
  }

  private async hydrate(rows: Awaited<ReturnType<ReturnType<AccountsRepository["select"]>["where"]>>, db: Executor = this.db): Promise<AccountDto[]> {
    const ids = rows.map((row) => row.id);
    const [expertise, grants, links] = await Promise.all([
      expertiseRefsByOwner(
        db as Database,
        {
          table: adminUserExpertise,
          ownerId: adminUserExpertise.adminUserId,
          expertiseId: adminUserExpertise.expertiseId,
          position: adminUserExpertise.position,
        },
        ids,
      ),
      this.services.grantRefsFor(db, "account", ids),
      this.pendingLinks(db, ids),
    ]);
    return rows.map((row) => ({
      id: row.id,
      accountId: formatAccountId(row.accountNumber),
      name: row.name,
      displayName: row.displayName,
      email: row.email,
      role: row.roleKey ? { key: row.roleKey, label: row.roleLabel ?? row.roleKey } : null,
      status: row.status as AccountDto["status"],
      description: row.description,
      expertise: expertise.get(row.id) ?? [],
      permissions: grants.get(row.id) ?? [],
      hasPicture: row.pictureKey !== null,
      lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
      deactivatedAt: row.deactivatedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      pendingLink: links.get(row.id) ?? null,
    }));
  }

  private async pendingLinks(db: Executor, ids: string[]) {
    const result = new Map<string, AccountDto["pendingLink"]>();
    if (ids.length === 0) return result;
    const rows = await db
      .select({ adminUserId: adminTokens.adminUserId, purpose: adminTokens.purpose, expiresAt: adminTokens.expiresAt })
      .from(adminTokens)
      .where(and(inArray(adminTokens.adminUserId, ids), isNull(adminTokens.usedAt), gt(adminTokens.expiresAt, new Date())))
      .orderBy(desc(adminTokens.createdAt));
    for (const row of rows) {
      if (!result.has(row.adminUserId)) result.set(row.adminUserId, { purpose: row.purpose as "invite" | "reset", expiresAt: row.expiresAt.toISOString() });
    }
    return result;
  }

  /** The account's own expertise, in this order (OPS-135). */
  async setExpertise(tx: Executor, id: string, expertiseIds: readonly string[]): Promise<void> {
    await tx.delete(adminUserExpertise).where(eq(adminUserExpertise.adminUserId, id));
    if (expertiseIds.length > 0)
      await tx.insert(adminUserExpertise).values(expertiseIds.map((expertiseId, position) => ({ adminUserId: id, expertiseId, position })));
  }

  async emailTaken(email: string, exceptId?: string, db: Executor = this.db): Promise<boolean> {
    const [row] = await db
      .select({ id: adminUsers.id })
      .from(adminUsers)
      .where(and(sql`lower(${adminUsers.email}) = ${email.toLowerCase()}`, ...(exceptId ? [not(eq(adminUsers.id, exceptId))] : [])))
      .limit(1);
    return row !== undefined;
  }

  /** Active Rootadmins other than this account (the last one is protected). */
  async otherActiveOwners(id: string, db: Executor = this.db): Promise<number> {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(adminUsers)
      .where(and(eq(adminUsers.role, "owner"), eq(adminUsers.status, "active"), not(eq(adminUsers.id, id))));
    return row?.count ?? 0;
  }

  async update(tx: Executor, id: string, values: Partial<typeof adminUsers.$inferInsert>): Promise<void> {
    await tx
      .update(adminUsers)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(adminUsers.id, id));
  }

  async passwordHashOf(id: string): Promise<string | null> {
    const [row] = await this.db.select({ passwordHash: adminUsers.passwordHash }).from(adminUsers).where(eq(adminUsers.id, id)).limit(1);
    return row?.passwordHash ?? null;
  }

  // ---- One-time links of an account (reset; invitations of accounts invited before OPS-141) ----

  async expireTokens(tx: Executor, adminUserId: string): Promise<void> {
    await tx
      .update(adminTokens)
      .set({ usedAt: new Date() })
      .where(and(eq(adminTokens.adminUserId, adminUserId), isNull(adminTokens.usedAt)));
  }

  /** A new link replaces the account's unused ones (only the latest works). */
  async createToken(
    tx: Executor,
    values: { adminUserId: string; purpose: "invite" | "reset"; tokenHash: string; expiresAt: Date; createdById: string | null; createdAt: Date },
  ): Promise<void> {
    // createdAt comes from the caller's clock, like expiresAt: the row's "expires after creation" rule then holds whatever the clock says.
    await tx
      .update(adminTokens)
      .set({ usedAt: values.createdAt })
      .where(and(eq(adminTokens.adminUserId, values.adminUserId), isNull(adminTokens.usedAt)));
    await tx.insert(adminTokens).values(values);
  }

  async findToken(tokenHash: string, db: Executor = this.db) {
    const [row] = await db
      .select({
        id: adminTokens.id,
        adminUserId: adminTokens.adminUserId,
        purpose: adminTokens.purpose,
        expiresAt: adminTokens.expiresAt,
        usedAt: adminTokens.usedAt,
        email: adminUsers.email,
        displayName: adminUsers.displayName,
        status: adminUsers.status,
        role: adminUsers.role,
      })
      .from(adminTokens)
      .innerJoin(adminUsers, eq(adminUsers.id, adminTokens.adminUserId))
      .where(eq(adminTokens.tokenHash, tokenHash))
      .limit(1);
    return row;
  }

  /** Marks a link used; false when it was already (a concurrent use loses). */
  async useToken(tx: Executor, id: string): Promise<boolean> {
    const used = await tx
      .update(adminTokens)
      .set({ usedAt: new Date() })
      .where(and(eq(adminTokens.id, id), isNull(adminTokens.usedAt)))
      .returning({ id: adminTokens.id });
    return used.length === 1;
  }

  // ---- Invitation links (OPS-141) ----

  private selectInvitations(db: Executor = this.db) {
    return db
      .select({
        id: adminInvitations.id,
        createdAt: adminInvitations.createdAt,
        createdBy: accountName(inviter),
        expiresAt: adminInvitations.expiresAt,
        usedAt: adminInvitations.usedAt,
        accountId: invitee.id,
        accountName: accountName(invitee),
        revokedAt: adminInvitations.revokedAt,
      })
      .from(adminInvitations)
      .leftJoin(inviter, eq(inviter.id, adminInvitations.createdById))
      .leftJoin(invitee, eq(invitee.id, adminInvitations.usedById));
  }

  /** The newest first: pending ones, then the 20 latest used, revoked or expired. */
  async listInvitations(now: Date): Promise<InvitationDto[]> {
    const pending = and(isNull(adminInvitations.usedAt), isNull(adminInvitations.revokedAt), gt(adminInvitations.expiresAt, now));
    const [open, past] = await Promise.all([
      this.selectInvitations().where(pending).orderBy(desc(adminInvitations.createdAt)),
      this.selectInvitations().where(not(pending!)).orderBy(desc(adminInvitations.createdAt)).limit(20),
    ]);
    return [...open, ...past].map((row) => toInvitation(row, now));
  }

  async findInvitation(id: string, now: Date, db: Executor = this.db): Promise<InvitationDto | undefined> {
    const [row] = await this.selectInvitations(db).where(eq(adminInvitations.id, id)).limit(1);
    return row ? toInvitation(row, now) : undefined;
  }

  async findInvitationByToken(tokenHash: string, db: Executor = this.db) {
    const [row] = await db
      .select({
        id: adminInvitations.id,
        expiresAt: adminInvitations.expiresAt,
        usedAt: adminInvitations.usedAt,
        revokedAt: adminInvitations.revokedAt,
        createdById: adminInvitations.createdById,
      })
      .from(adminInvitations)
      .where(eq(adminInvitations.tokenHash, tokenHash))
      .limit(1);
    return row;
  }

  async createInvitation(tx: Executor, values: { tokenHash: string; expiresAt: Date; createdById: string; createdAt: Date }): Promise<string> {
    const [row] = await tx.insert(adminInvitations).values(values).returning({ id: adminInvitations.id });
    return row!.id;
  }

  /** Marks it used by this account; false when it was used, revoked or expired meanwhile (a concurrent use loses). */
  async useInvitation(tx: Executor, id: string, accountId: string, now: Date): Promise<boolean> {
    const used = await tx
      .update(adminInvitations)
      .set({ usedAt: now, usedById: accountId })
      .where(and(eq(adminInvitations.id, id), isNull(adminInvitations.usedAt), isNull(adminInvitations.revokedAt), gt(adminInvitations.expiresAt, now)))
      .returning({ id: adminInvitations.id });
    return used.length === 1;
  }

  /** False when it was already used or revoked. */
  async revokeInvitation(tx: Executor, id: string, by: string, now: Date): Promise<boolean> {
    const revoked = await tx
      .update(adminInvitations)
      .set({ revokedAt: now, revokedById: by })
      .where(and(eq(adminInvitations.id, id), isNull(adminInvitations.usedAt), isNull(adminInvitations.revokedAt)))
      .returning({ id: adminInvitations.id });
    return revoked.length === 1;
  }

  /** An account made from an invitation link: active, no role (OPS-141). */
  async createSignedUp(tx: Executor, values: { email: string; passwordHash: string; invitedById: string | null }): Promise<string> {
    const [row] = await tx
      .insert(adminUsers)
      .values({ ...values, role: null, status: "active" })
      .returning({ id: adminUsers.id });
    return row!.id;
  }

  /** Whether a stored file is still used by an account picture or a Treasury document (before removing it). */
}

function toInvitation(
  row: {
    id: string;
    createdAt: Date;
    createdBy: string | null;
    expiresAt: Date;
    usedAt: Date | null;
    accountId: string | null;
    accountName: string | null;
    revokedAt: Date | null;
  },
  now: Date,
): InvitationDto {
  const status = row.usedAt ? "used" : row.revokedAt ? "revoked" : row.expiresAt <= now ? "expired" : "pending";
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    createdBy: row.createdBy,
    expiresAt: row.expiresAt.toISOString(),
    status,
    usedAt: row.usedAt?.toISOString() ?? null,
    account: row.accountId ? { id: row.accountId, name: row.accountName ?? "" } : null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
  };
}
