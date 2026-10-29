import { Inject, Injectable } from "@nestjs/common";
import { aliasedTable, and, asc, eq, exists, ilike, isNotNull, isNull, not, notIlike, or, sql, type SQL } from "drizzle-orm";
import { adminUsers } from "../auth/auth.schema.js";
import { DATABASE, type Database } from "../common/database/database.module.js";
import type { Page, Sort } from "../common/listing/list-query.js";
import { people } from "../people/people.schema.js";
import type {
  CreateGrantRequest,
  CreateServiceRequest,
  GrantDto,
  GrantRef,
  GrantSortField,
  GrantsListQuery,
  ServiceDto,
  ServiceSortField,
  ServicesListQuery,
  ServicesOptionsDto,
  UpdateGrantRequest,
  UpdateServiceRequest,
  VocabularyEntry,
} from "./services.contracts.js";
import { grantRefsByOwner } from "./grant-refs.js";
import { accessGrants, accessLevels, accessStatuses, serviceCategories, serviceHostingModels, services, serviceStatuses } from "./services.schema.js";

export type Executor = Pick<Database, "select" | "insert" | "update" | "delete">;

/** An account's name as the admin shows it: its display name, else the email's local part. */
export const accountName = (table: typeof adminUsers) => sql<string>`coalesce(${table.displayName}, split_part(${table.email}, '@', 1))`;

const contains = (text: string) => `%${text.replace(/[\\%_]/g, (match) => `\\${match}`)}%`;
const vocabulary = (key: string | null, label: string | null): VocabularyEntry | null => (key ? { key, label: label ?? key } : null);
const iso = (value: Date | null) => value?.toISOString() ?? null;

/** Grants that need a look (the Review queue / Access review): unconfirmed, or expiring within 30 days. */
const grantNeedsReview = (table: typeof accessGrants) =>
  sql`(${table.statusKey} in ('needs_confirmation', 'planned', 'invited') or (${table.expiresOn} is not null and ${table.expiresOn} <= current_date + 30 and coalesce(${table.statusKey}, '') not in ('revoked', 'expired')))`;

const responsible = aliasedTable(adminUsers, "responsible");
const grantAccount = aliasedTable(adminUsers, "grant_account");

@Injectable()
export class ServicesRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async options(): Promise<ServicesOptionsDto> {
    const lookup = (table: typeof serviceStatuses) => this.db.select({ key: table.key, label: table.label }).from(table).orderBy(asc(table.sortOrder));
    const [statuses, categories, hostingModels, levels, statusesOfAccess, accounts] = await Promise.all([
      lookup(serviceStatuses),
      lookup(serviceCategories),
      lookup(serviceHostingModels),
      lookup(accessLevels),
      lookup(accessStatuses),
      this.db
        .select({ id: adminUsers.id, name: accountName(adminUsers) })
        .from(adminUsers)
        .where(eq(adminUsers.status, "active"))
        .orderBy(asc(sql`lower(${accountName(adminUsers)})`)),
    ]);
    return { statuses, categories, hostingModels, levels, accessStatuses: statusesOfAccess, accounts };
  }

  async knownKey(table: "status" | "category" | "hosting" | "level" | "accessStatus", key: string): Promise<boolean> {
    const target = { status: serviceStatuses, category: serviceCategories, hosting: serviceHostingModels, level: accessLevels, accessStatus: accessStatuses }[table];
    const [row] = await this.db.select({ key: target.key }).from(target).where(eq(target.key, key)).limit(1);
    return row !== undefined;
  }

  // ---- Services ----

  private selectServices(db: Executor = this.db) {
    return db
      .select({
        id: services.id,
        serviceNumber: services.serviceNumber,
        name: services.name,
        statusKey: services.statusKey,
        statusLabel: serviceStatuses.label,
        categoryKey: services.categoryKey,
        categoryLabel: serviceCategories.label,
        hostingKey: services.hostingModelKey,
        hostingLabel: serviceHostingModels.label,
        url: services.url,
        description: services.description,
        responsibleId: responsible.id,
        responsibleName: accountName(responsible),
        archivedAt: services.archivedAt,
        createdAt: services.createdAt,
        updatedAt: services.updatedAt,
      })
      .from(services)
      .leftJoin(serviceStatuses, eq(serviceStatuses.key, services.statusKey))
      .leftJoin(serviceCategories, eq(serviceCategories.key, services.categoryKey))
      .leftJoin(serviceHostingModels, eq(serviceHostingModels.key, services.hostingModelKey))
      .leftJoin(responsible, eq(responsible.id, services.responsibleAdminId));
  }

  async listServices(query: ServicesListQuery): Promise<Page<ServiceDto>> {
    const where = this.serviceWhere(query);
    const expression: Record<ServiceSortField, SQL> = {
      name: sql`lower(${services.name})`,
      number: sql`${services.serviceNumber}`,
      status: sql`${serviceStatuses.sortOrder}`,
      category: sql`lower(${serviceCategories.label})`,
      updated: sql`${services.updatedAt}`,
      created: sql`${services.createdAt}`,
    };
    const order = (query.sort as Sort<ServiceSortField>[]).map(({ field, direction }) => sql`${expression[field]} ${sql.raw(direction)} nulls last`);
    const [rows, [count]] = await Promise.all([
      this.selectServices()
        .where(where)
        .orderBy(...order, asc(services.id))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize),
      this.db
        .select({ total: sql<number>`count(*)::int` })
        .from(services)
        .leftJoin(serviceStatuses, eq(serviceStatuses.key, services.statusKey))
        .leftJoin(serviceCategories, eq(serviceCategories.key, services.categoryKey))
        .where(where),
    ]);
    return { items: await this.hydrateServices(rows), page: query.page, pageSize: query.pageSize, total: count?.total ?? 0 };
  }

  private serviceWhere(query: ServicesListQuery): SQL | undefined {
    const conditions: (SQL | undefined)[] = [];
    const archived = query.filters.find((filter) => filter.field === "archived");
    conditions.push(archived?.value === true ? isNotNull(services.archivedAt) : isNull(services.archivedAt));
    if (query.search?.trim()) {
      const pattern = contains(query.search.trim());
      conditions.push(or(ilike(services.name, pattern), ilike(services.url, pattern), ilike(services.description, pattern), sql`${services.serviceNumber}::text = ${query.search.trim()}`));
    }
    const column = { status: services.statusKey, category: services.categoryKey, hosting: services.hostingModelKey, responsible: services.responsibleAdminId } as const;
    for (const filter of query.filters) {
      const value = typeof filter.value === "string" ? filter.value : "";
      if (filter.field === "name") {
        conditions.push(filter.operator === "contains" ? ilike(services.name, contains(value)) : notIlike(services.name, contains(value)));
      } else if (filter.field === "review") {
        conditions.push(
          or(
            eq(services.statusKey, "needs_confirmation"),
            exists(this.db.select({ one: sql`1` }).from(accessGrants).where(and(eq(accessGrants.serviceId, services.id), isNull(accessGrants.archivedAt), grantNeedsReview(accessGrants)))),
          ),
        );
      } else if (filter.field in column) {
        const target = column[filter.field as keyof typeof column];
        if (filter.operator === "is") conditions.push(eq(target, value));
        else if (filter.operator === "is_not") conditions.push(or(isNull(target), not(eq(target, value))));
        else if (filter.operator === "is_empty") conditions.push(isNull(target));
        else if (filter.operator === "is_not_empty") conditions.push(isNotNull(target));
      }
    }
    return and(...conditions);
  }

  private async hydrateServices(rows: Awaited<ReturnType<ReturnType<ServicesRepository["selectServices"]>["where"]>>, db: Executor = this.db): Promise<ServiceDto[]> {
    const grants = await this.grantRefsFor(db, "service", rows.map((row) => row.id));
    return rows.map((row) => ({
      id: row.id,
      serviceNumber: row.serviceNumber,
      name: row.name,
      status: vocabulary(row.statusKey, row.statusLabel),
      category: vocabulary(row.categoryKey, row.categoryLabel),
      hostingModel: vocabulary(row.hostingKey, row.hostingLabel),
      url: row.url,
      description: row.description,
      responsible: row.responsibleId ? { id: row.responsibleId, name: row.responsibleName } : null,
      permissions: grants.get(row.id) ?? [],
      archivedAt: iso(row.archivedAt),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  async findService(id: string, db: Executor = this.db): Promise<ServiceDto | undefined> {
    const [service] = await this.hydrateServices(await this.selectServices(db).where(eq(services.id, id)).limit(1), db);
    return service;
  }

  async createService(tx: Executor, input: CreateServiceRequest): Promise<string> {
    const [row] = await tx.insert(services).values({ ...serviceValues(input), name: input.name }).returning({ id: services.id });
    return row!.id;
  }

  async updateService(tx: Executor, id: string, input: UpdateServiceRequest): Promise<void> {
    await tx.update(services).set({ ...serviceValues(input), updatedAt: new Date() }).where(eq(services.id, id));
  }

  async setServiceArchived(tx: Executor, id: string, adminId: string | null, archived: boolean): Promise<void> {
    await tx
      .update(services)
      .set(archived ? { archivedAt: new Date(), archivedById: adminId, updatedAt: new Date() } : { archivedAt: null, archivedById: null, updatedAt: new Date() })
      .where(eq(services.id, id));
  }

  async serviceHasGrants(id: string): Promise<boolean> {
    const [row] = await this.db.select({ id: accessGrants.id }).from(accessGrants).where(eq(accessGrants.serviceId, id)).limit(1);
    return row !== undefined;
  }

  async deleteService(tx: Executor, id: string): Promise<void> {
    await tx.delete(services).where(eq(services.id, id));
  }

  // ---- Access grants ----

  private selectGrants(db: Executor = this.db) {
    return db
      .select({
        id: accessGrants.id,
        grantNumber: accessGrants.grantNumber,
        name: accessGrants.name,
        personId: people.id,
        personName: people.name,
        accountId: grantAccount.id,
        accountName: accountName(grantAccount),
        serviceId: services.id,
        serviceName: services.name,
        levelKey: accessGrants.levelKey,
        levelLabel: accessLevels.label,
        statusKey: accessGrants.statusKey,
        statusLabel: accessStatuses.label,
        resourceScope: accessGrants.resourceScope,
        grantedOn: accessGrants.grantedOn,
        revokedOn: accessGrants.revokedOn,
        expiresOn: accessGrants.expiresOn,
        archivedAt: accessGrants.archivedAt,
        createdAt: accessGrants.createdAt,
        updatedAt: accessGrants.updatedAt,
      })
      .from(accessGrants)
      .innerJoin(services, eq(services.id, accessGrants.serviceId))
      .leftJoin(people, eq(people.id, accessGrants.personId))
      .leftJoin(grantAccount, eq(grantAccount.id, accessGrants.adminUserId))
      .leftJoin(accessLevels, eq(accessLevels.key, accessGrants.levelKey))
      .leftJoin(accessStatuses, eq(accessStatuses.key, accessGrants.statusKey));
  }

  /** The grant's shown name: its own, else "<service> / <level>" (Figma p17). */
  private titleExpression = sql<string>`coalesce(${accessGrants.name}, ${services.name} || coalesce(' / ' || ${accessLevels.label}, ''))`;

  async listGrants(query: GrantsListQuery): Promise<Page<GrantDto>> {
    const where = this.grantWhere(query);
    const expression: Record<GrantSortField, SQL> = {
      name: sql`lower(${this.titleExpression})`,
      number: sql`${accessGrants.grantNumber}`,
      service: sql`lower(${services.name})`,
      account: sql`lower(coalesce(${people.name}, ${accountName(grantAccount)}))`,
      level: sql`${accessLevels.sortOrder}`,
      status: sql`${accessStatuses.sortOrder}`,
      expires: sql`${accessGrants.expiresOn}`,
      updated: sql`${accessGrants.updatedAt}`,
      created: sql`${accessGrants.createdAt}`,
    };
    const order = (query.sort as Sort<GrantSortField>[]).map(({ field, direction }) => sql`${expression[field]} ${sql.raw(direction)} nulls last`);
    const [rows, [count]] = await Promise.all([
      this.selectGrants()
        .where(where)
        .orderBy(...order, asc(accessGrants.id))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize),
      this.db
        .select({ total: sql<number>`count(*)::int` })
        .from(accessGrants)
        .innerJoin(services, eq(services.id, accessGrants.serviceId))
        .leftJoin(people, eq(people.id, accessGrants.personId))
        .leftJoin(grantAccount, eq(grantAccount.id, accessGrants.adminUserId))
        .leftJoin(accessLevels, eq(accessLevels.key, accessGrants.levelKey))
        .where(where),
    ]);
    return { items: rows.map(toGrant), page: query.page, pageSize: query.pageSize, total: count?.total ?? 0 };
  }

  private grantWhere(query: GrantsListQuery): SQL | undefined {
    const conditions: (SQL | undefined)[] = [];
    const archived = query.filters.find((filter) => filter.field === "archived");
    conditions.push(archived?.value === true ? isNotNull(accessGrants.archivedAt) : isNull(accessGrants.archivedAt));
    if (query.search?.trim()) {
      const pattern = contains(query.search.trim());
      conditions.push(
        or(
          ilike(this.titleExpression, pattern),
          ilike(services.name, pattern),
          ilike(people.name, pattern),
          ilike(accountName(grantAccount), pattern),
          ilike(accessGrants.resourceScope, pattern),
          sql`${accessGrants.grantNumber}::text = ${query.search.trim()}`,
        ),
      );
    }
    const column = { service: accessGrants.serviceId, person: accessGrants.personId, account: accessGrants.adminUserId, level: accessGrants.levelKey, status: accessGrants.statusKey } as const;
    // Several "is" rules on one field mean any of them (as on the other lists).
    const anyOf = new Map<string, SQL[]>();
    for (const filter of query.filters) {
      const value = typeof filter.value === "string" ? filter.value : "";
      if (filter.field === "review") {
        conditions.push(grantNeedsReview(accessGrants));
      } else if (filter.field in column) {
        const target = column[filter.field as keyof typeof column];
        if (filter.operator === "is") anyOf.set(filter.field, [...(anyOf.get(filter.field) ?? []), eq(target, value)]);
        else if (filter.operator === "is_not") conditions.push(or(isNull(target), not(eq(target, value))));
        else if (filter.operator === "is_empty") conditions.push(isNull(target));
        else if (filter.operator === "is_not_empty") conditions.push(isNotNull(target));
      }
    }
    for (const options of anyOf.values()) conditions.push(or(...options));
    return and(...conditions);
  }

  async findGrant(id: string, db: Executor = this.db): Promise<GrantDto | undefined> {
    const [row] = await this.selectGrants(db).where(eq(accessGrants.id, id)).limit(1);
    return row ? toGrant(row) : undefined;
  }

  /** The grants of people, accounts or services (not archived): grant-refs.ts. */
  grantRefsFor(db: Executor, owner: "person" | "account" | "service", ids: readonly string[]): Promise<Map<string, GrantRef[]>> {
    return grantRefsByOwner(db, owner, ids);
  }

  async createGrant(tx: Executor, input: CreateGrantRequest): Promise<string> {
    const [row] = await tx.insert(accessGrants).values({ ...grantValues(input), serviceId: input.serviceId }).returning({ id: accessGrants.id });
    return row!.id;
  }

  async updateGrant(tx: Executor, id: string, input: UpdateGrantRequest): Promise<void> {
    await tx.update(accessGrants).set({ ...grantValues(input), updatedAt: new Date() }).where(eq(accessGrants.id, id));
  }

  async setGrantArchived(tx: Executor, id: string, adminId: string | null, archived: boolean): Promise<void> {
    await tx
      .update(accessGrants)
      .set(archived ? { archivedAt: new Date(), archivedById: adminId, updatedAt: new Date() } : { archivedAt: null, archivedById: null, updatedAt: new Date() })
      .where(eq(accessGrants.id, id));
  }

  async deleteGrant(tx: Executor, id: string): Promise<void> {
    await tx.delete(accessGrants).where(eq(accessGrants.id, id));
  }

  async personExists(id: string): Promise<boolean> {
    const [row] = await this.db.select({ id: people.id }).from(people).where(eq(people.id, id)).limit(1);
    return row !== undefined;
  }

  async accountExists(id: string): Promise<boolean> {
    const [row] = await this.db.select({ id: adminUsers.id }).from(adminUsers).where(eq(adminUsers.id, id)).limit(1);
    return row !== undefined;
  }

  async serviceExists(id: string): Promise<boolean> {
    const [row] = await this.db.select({ id: services.id }).from(services).where(eq(services.id, id)).limit(1);
    return row !== undefined;
  }
}

function serviceValues(input: UpdateServiceRequest): Partial<typeof services.$inferInsert> {
  const values: Partial<typeof services.$inferInsert> = {};
  if (input.name !== undefined) values.name = input.name;
  if (input.statusKey !== undefined) values.statusKey = input.statusKey;
  if (input.categoryKey !== undefined) values.categoryKey = input.categoryKey;
  if (input.hostingModelKey !== undefined) values.hostingModelKey = input.hostingModelKey;
  if (input.url !== undefined) values.url = input.url;
  if (input.description !== undefined) values.description = input.description;
  if (input.responsibleAdminId !== undefined) values.responsibleAdminId = input.responsibleAdminId;
  return values;
}

function grantValues(input: UpdateGrantRequest): Partial<typeof accessGrants.$inferInsert> {
  const values: Partial<typeof accessGrants.$inferInsert> = {};
  for (const key of ["name", "personId", "adminUserId", "serviceId", "levelKey", "statusKey", "resourceScope", "grantedOn", "revokedOn", "expiresOn"] as const) {
    if (input[key] !== undefined) (values as Record<string, unknown>)[key] = input[key];
  }
  return values;
}

type GrantRow = {
  id: string;
  grantNumber: number;
  name: string | null;
  personId: string | null;
  personName: string | null;
  accountId: string | null;
  accountName: string | null;
  serviceId: string;
  serviceName: string;
  levelKey: string | null;
  levelLabel: string | null;
  statusKey: string | null;
  statusLabel: string | null;
  resourceScope: string | null;
  grantedOn: string | null;
  revokedOn: string | null;
  expiresOn: string | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function toGrant(row: GrantRow): GrantDto {
  const level = vocabulary(row.levelKey, row.levelLabel);
  return {
    id: row.id,
    grantNumber: row.grantNumber,
    name: row.name,
    title: row.name ?? `${row.serviceName}${level ? ` / ${level.label}` : ""}`,
    person: row.personId ? { id: row.personId, name: row.personName ?? "" } : null,
    account: row.accountId ? { id: row.accountId, name: row.accountName ?? "" } : null,
    service: { id: row.serviceId, name: row.serviceName },
    level,
    status: vocabulary(row.statusKey, row.statusLabel),
    resourceScope: row.resourceScope,
    grantedOn: row.grantedOn,
    revokedOn: row.revokedOn,
    expiresOn: row.expiresOn,
    archivedAt: iso(row.archivedAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
