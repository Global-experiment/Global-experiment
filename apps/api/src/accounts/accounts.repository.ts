import { Inject, Injectable } from "@nestjs/common";
import { and, asc, desc, eq, gt, inArray, isNull, not, or, sql, type SQL } from "drizzle-orm";
import { adminRoles, adminTokens, adminUsers } from "../auth/auth.schema.js";
import { DATABASE, type Database } from "../common/database/database.module.js";
import type { Page, Sort } from "../common/listing/list-query.js";
import { expertiseRefsByOwner } from "../expertise/expertise-refs.js";
import { people, peopleExpertise } from "../people/people.schema.js";
import { ServicesRepository, accountName } from "../services/services.repository.js";
import { treasuryDocuments } from "../treasury/treasury-documents.schema.js";
import type { AccountDto, AccountSortField, AccountsListQuery, ProfileDto } from "./accounts.contracts.js";

export type Executor = Pick<Database, "select" | "insert" | "update" | "delete">;

/** "GE-000001": the account number on six digits (Figma p18). */
export const formatAccountId = (accountNumber: number) => `GE-${String(accountNumber).padStart(6, "0")}`;

const contains = (text: string) => `%${text.replace(/[\\%_]/g, (match) => `\\${match}`)}%`;

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
        note: adminUsers.note,
        personId: people.id,
        personName: people.name,
        pictureKey: adminUsers.pictureKey,
        timeZone: adminUsers.timeZone,
        appearance: adminUsers.appearance,
        lastLoginAt: adminUsers.lastLoginAt,
        deactivatedAt: adminUsers.deactivatedAt,
        createdAt: adminUsers.createdAt,
        updatedAt: adminUsers.updatedAt,
      })
      .from(adminUsers)
      .innerJoin(adminRoles, eq(adminRoles.key, adminUsers.role))
      .leftJoin(people, eq(people.id, adminUsers.personId));
  }

  async list(query: AccountsListQuery): Promise<Page<AccountDto>> {
    const conditions: (SQL | undefined)[] = [];
    if (query.search?.trim()) {
      const pattern = contains(query.search.trim());
      conditions.push(or(sql`${accountName(adminUsers)} ilike ${pattern}`, sql`${adminUsers.email} ilike ${pattern}`, sql`${adminUsers.note} ilike ${pattern}`, sql`${adminRoles.label} ilike ${pattern}`));
    }
    const anyOf = new Map<string, SQL[]>();
    for (const filter of query.filters) {
      const column = filter.field === "status" ? adminUsers.status : adminUsers.role;
      const value = String(filter.value);
      if (filter.operator === "is") anyOf.set(filter.field, [...(anyOf.get(filter.field) ?? []), eq(column, value)]);
      else conditions.push(not(eq(column, value)));
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
      this.db.select({ total: sql<number>`count(*)::int` }).from(adminUsers).innerJoin(adminRoles, eq(adminRoles.key, adminUsers.role)).where(where),
    ]);
    return { items: await this.hydrate(rows), page: query.page, pageSize: query.pageSize, total: count?.total ?? 0 };
  }

  async find(id: string, db: Executor = this.db): Promise<AccountDto | undefined> {
    const [account] = await this.hydrate(await this.select(db).where(eq(adminUsers.id, id)).limit(1), db);
    return account;
  }

  async findProfile(id: string): Promise<(Omit<ProfileDto, "permissionKeys"> & { pictureKey: string | null }) | undefined> {
    const rows = await this.select().where(eq(adminUsers.id, id)).limit(1);
    const [account] = await this.hydrate(rows);
    const row = rows[0];
    if (!account || !row) return undefined;
    return { ...account, timeZone: row.timeZone, appearance: row.appearance as ProfileDto["appearance"], pictureKey: row.pictureKey };
  }

  private async hydrate(rows: Awaited<ReturnType<ReturnType<AccountsRepository["select"]>["where"]>>, db: Executor = this.db): Promise<AccountDto[]> {
    const ids = rows.map((row) => row.id);
    const personIds = rows.flatMap((row) => (row.personId ? [row.personId] : []));
    const [expertise, grantsByPerson, grantsByAccount, links] = await Promise.all([
      expertiseRefsByOwner(db as Database, { table: peopleExpertise, ownerId: peopleExpertise.personId, expertiseId: peopleExpertise.expertiseId, position: peopleExpertise.position }, personIds),
      this.services.grantRefsFor(db, "person", personIds),
      this.services.grantRefsFor(db, "account", ids),
      this.pendingLinks(db, ids),
    ]);
    return rows.map((row) => {
      // The account's grants and its person's, once each.
      const grants = new Map([...(row.personId ? (grantsByPerson.get(row.personId) ?? []) : []), ...(grantsByAccount.get(row.id) ?? [])].map((grant) => [grant.id, grant]));
      return {
        id: row.id,
        accountId: formatAccountId(row.accountNumber),
        name: row.name,
        displayName: row.displayName,
        email: row.email,
        role: { key: row.roleKey, label: row.roleLabel },
        status: row.status as AccountDto["status"],
        note: row.note,
        person: row.personId ? { id: row.personId, name: row.personName ?? "" } : null,
        expertise: (row.personId ? (expertise.get(row.personId) ?? []) : []).map((item) => ({ id: item.id, name: item.name })),
        permissions: [...grants.values()],
        hasPicture: row.pictureKey !== null,
        lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
        deactivatedAt: row.deactivatedAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        pendingLink: links.get(row.id) ?? null,
      };
    });
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

  async emailTaken(email: string, exceptId?: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: adminUsers.id })
      .from(adminUsers)
      .where(and(sql`lower(${adminUsers.email}) = ${email.toLowerCase()}`, ...(exceptId ? [not(eq(adminUsers.id, exceptId))] : [])))
      .limit(1);
    return row !== undefined;
  }

  async personTaken(personId: string, exceptId?: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: adminUsers.id })
      .from(adminUsers)
      .where(and(eq(adminUsers.personId, personId), ...(exceptId ? [not(eq(adminUsers.id, exceptId))] : [])))
      .limit(1);
    return row !== undefined;
  }

  async personExists(personId: string): Promise<boolean> {
    const [row] = await this.db.select({ id: people.id }).from(people).where(eq(people.id, personId)).limit(1);
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

  async createInvited(tx: Executor, values: { email: string; displayName: string | null; role: string; personId: string | null; note: string | null; invitedById: string }): Promise<string> {
    const [row] = await tx.insert(adminUsers).values({ ...values, status: "invited", passwordHash: null }).returning({ id: adminUsers.id });
    return row!.id;
  }

  async update(tx: Executor, id: string, values: Partial<typeof adminUsers.$inferInsert>): Promise<void> {
    await tx.update(adminUsers).set({ ...values, updatedAt: new Date() }).where(eq(adminUsers.id, id));
  }

  async passwordHashOf(id: string): Promise<string | null> {
    const [row] = await this.db.select({ passwordHash: adminUsers.passwordHash }).from(adminUsers).where(eq(adminUsers.id, id)).limit(1);
    return row?.passwordHash ?? null;
  }

  // ---- One-time links ----

  async expireTokens(tx: Executor, adminUserId: string): Promise<void> {
    await tx.update(adminTokens).set({ usedAt: new Date() }).where(and(eq(adminTokens.adminUserId, adminUserId), isNull(adminTokens.usedAt)));
  }

  /** A new link replaces the account's unused ones (only the latest works). */
  async createToken(tx: Executor, values: { adminUserId: string; purpose: "invite" | "reset"; tokenHash: string; expiresAt: Date; createdById: string | null }): Promise<void> {
    await tx
      .update(adminTokens)
      .set({ usedAt: new Date() })
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
    const used = await tx.update(adminTokens).set({ usedAt: new Date() }).where(and(eq(adminTokens.id, id), isNull(adminTokens.usedAt))).returning({ id: adminTokens.id });
    return used.length === 1;
  }

  /** Whether a stored file is still used by an account picture or a Treasury document (before removing it). */
  async storageKeyInUse(key: string): Promise<boolean> {
    const [picture] = await this.db.select({ id: adminUsers.id }).from(adminUsers).where(eq(adminUsers.pictureKey, key)).limit(1);
    if (picture) return true;
    const [document] = await this.db.select({ id: treasuryDocuments.id }).from(treasuryDocuments).where(eq(treasuryDocuments.storageKey, key)).limit(1);
    return document !== undefined;
  }
}
