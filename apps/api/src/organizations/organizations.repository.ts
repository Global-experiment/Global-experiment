import { Inject, Injectable } from "@nestjs/common";
import { and, asc, eq, exists, ilike, inArray, isNotNull, isNull, not, notIlike, or, sql, type SQL } from "drizzle-orm";
import { DATABASE, type Database } from "../common/database/database.module.js";
import { containsPattern, groupFilters, type Page, type Sort } from "../common/listing/list-query.js";
import { expertiseRefsByOwner } from "../expertise/expertise-refs.js";
import { expertiseItems } from "../expertise/expertise.schema.js";
import type { EntityRef } from "../people/people.contracts.js";
import { people, peopleOrganizations } from "../people/people.schema.js";
import type {
  CreateOrganizationRequest,
  OrganizationDto,
  OrganizationSortField,
  OrganizationsListQuery,
  UpdateOrganizationRequest,
} from "./organizations.contracts.js";
import { organizationExpertise, organizations } from "./organizations.schema.js";

type Executor = Pick<Database, "select" | "insert" | "update" | "delete">;

const peopleCount = sql<number>`(select count(*)::int from ${peopleOrganizations} where ${peopleOrganizations.organizationId} = ${organizations.id})`;

function selectOrganizations(db: Executor) {
  return db
    .select({
      id: organizations.id,
      name: organizations.name,
      website: organizations.website,
      note: organizations.note,
      createdAt: organizations.createdAt,
      updatedAt: organizations.updatedAt,
    })
    .from(organizations);
}
type OrganizationRow = Awaited<ReturnType<typeof selectOrganizations>>[number];

function orderBy(sorts: readonly Sort<OrganizationSortField>[]): SQL[] {
  const expression: Record<OrganizationSortField, SQL> = {
    name: sql`lower(${organizations.name})`,
    people: peopleCount,
    created: sql`${organizations.createdAt}`,
    updated: sql`${organizations.updatedAt}`,
  };
  return [
    ...sorts.map(({ field, direction }) =>
      direction === "asc" ? sql`${expression[field]} asc nulls last` : sql`${expression[field]} desc nulls last`,
    ),
    asc(organizations.id),
  ];
}

const hasExpertiseMatching = (db: Executor, condition?: SQL) =>
  exists(
    db
      .select({ one: sql`1` })
      .from(organizationExpertise)
      .innerJoin(expertiseItems, eq(expertiseItems.id, organizationExpertise.expertiseId))
      .where(and(eq(organizationExpertise.organizationId, organizations.id), condition)),
  );

const hasPersonMatching = (db: Executor, condition?: SQL) =>
  exists(
    db
      .select({ one: sql`1` })
      .from(peopleOrganizations)
      .innerJoin(people, eq(people.id, peopleOrganizations.personId))
      .where(and(eq(peopleOrganizations.organizationId, organizations.id), condition)),
  );

@Injectable()
export class OrganizationsRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async list(query: OrganizationsListQuery): Promise<Page<OrganizationDto>> {
    const where = this.whereClause(query);
    const [rows, [count]] = await Promise.all([
      selectOrganizations(this.db)
        .where(where)
        .orderBy(...orderBy(query.sort))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize),
      this.db.select({ total: sql<number>`count(*)::int` }).from(organizations).where(where),
    ]);
    return { items: await this.hydrate(rows), page: query.page, pageSize: query.pageSize, total: count?.total ?? 0 };
  }

  async findById(id: string, db: Executor = this.db): Promise<OrganizationDto | undefined> {
    const rows = await selectOrganizations(db).where(eq(organizations.id, id)).limit(1);
    const [organization] = await this.hydrate(rows, db);
    return organization;
  }

  async exists(id: string): Promise<boolean> {
    const [row] = await this.db.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, id)).limit(1);
    return row !== undefined;
  }

  async create(input: CreateOrganizationRequest): Promise<OrganizationDto> {
    return this.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(organizations)
        .values({ name: input.name, website: input.website ?? null, note: input.note ?? null })
        .returning({ id: organizations.id });
      await this.replaceExpertise(tx, created!.id, input.expertiseIds);
      return (await this.findById(created!.id, tx))!;
    });
  }

  async update(id: string, input: UpdateOrganizationRequest): Promise<OrganizationDto | undefined> {
    return this.db.transaction(async (tx) => {
      const values: Partial<typeof organizations.$inferInsert> = { updatedAt: new Date() };
      if (input.name !== undefined) values.name = input.name;
      if (input.website !== undefined) values.website = input.website;
      if (input.note !== undefined) values.note = input.note;
      const [updated] = await tx.update(organizations).set(values).where(eq(organizations.id, id)).returning({ id: organizations.id });
      if (!updated) return undefined;
      await this.replaceExpertise(tx, id, input.expertiseIds);
      return this.findById(id, tx);
    });
  }

  async linkExpertise(organizationId: string, expertiseId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.insert(organizationExpertise).values({ organizationId, expertiseId }).onConflictDoNothing();
      await tx.update(organizations).set({ updatedAt: new Date() }).where(eq(organizations.id, organizationId));
    });
  }

  async unlinkExpertise(organizationId: string, expertiseId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const removed = await tx
        .delete(organizationExpertise)
        .where(and(eq(organizationExpertise.organizationId, organizationId), eq(organizationExpertise.expertiseId, expertiseId)))
        .returning({ id: organizationExpertise.organizationId });
      if (removed.length > 0) await tx.update(organizations).set({ updatedAt: new Date() }).where(eq(organizations.id, organizationId));
    });
  }

  async personExists(personId: string): Promise<boolean> {
    const [row] = await this.db.select({ id: people.id }).from(people).where(eq(people.id, personId)).limit(1);
    return row !== undefined;
  }

  /**
   * Organization ↔ Person, from the organization's side: the same
   * people_organizations row the person's side manages. Idempotent; a real
   * change touches both records' updatedAt, since both now show it.
   */
  async linkPerson(organizationId: string, personId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const added = await tx
        .insert(peopleOrganizations)
        .values({ personId, organizationId })
        .onConflictDoNothing()
        .returning({ personId: peopleOrganizations.personId });
      if (added.length > 0) await this.touchBoth(tx, organizationId, personId);
    });
  }

  async unlinkPerson(organizationId: string, personId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const removed = await tx
        .delete(peopleOrganizations)
        .where(and(eq(peopleOrganizations.organizationId, organizationId), eq(peopleOrganizations.personId, personId)))
        .returning({ personId: peopleOrganizations.personId });
      if (removed.length > 0) await this.touchBoth(tx, organizationId, personId);
    });
  }

  private async touchBoth(tx: Executor, organizationId: string, personId: string) {
    const now = new Date();
    await tx.update(organizations).set({ updatedAt: now }).where(eq(organizations.id, organizationId));
    await tx.update(people).set({ updatedAt: now }).where(eq(people.id, personId));
  }

  private async replaceExpertise(tx: Executor, organizationId: string, expertiseIds?: string[]) {
    if (expertiseIds === undefined) return;
    await tx.delete(organizationExpertise).where(eq(organizationExpertise.organizationId, organizationId));
    if (expertiseIds.length > 0) {
      await tx.insert(organizationExpertise).values(expertiseIds.map((expertiseId) => ({ organizationId, expertiseId })));
    }
  }

  private whereClause(query: OrganizationsListQuery): SQL | undefined {
    const conditions: (SQL | undefined)[] = [];
    if (query.search) {
      const pattern = containsPattern(query.search);
      conditions.push(
        or(
          ilike(organizations.name, pattern),
          ilike(organizations.website, pattern),
          ilike(organizations.note, pattern),
          hasExpertiseMatching(this.db, ilike(expertiseItems.name, pattern)),
          hasPersonMatching(this.db, ilike(people.name, pattern)),
        ),
      );
    }
    const { anyOf, all } = groupFilters(query.filters);
    for (const [field, values] of anyOf) {
      const ids = values.map(String);
      if (field === "expertise") conditions.push(hasExpertiseMatching(this.db, inArray(organizationExpertise.expertiseId, ids)));
      if (field === "person") conditions.push(hasPersonMatching(this.db, inArray(peopleOrganizations.personId, ids)));
    }
    for (const { field, operator, value } of all) {
      const text = typeof value === "string" ? value : "";
      switch (`${field}:${operator}`) {
        case "name:contains":
          conditions.push(ilike(organizations.name, containsPattern(text)));
          break;
        case "name:not_contains":
          conditions.push(notIlike(organizations.name, containsPattern(text)));
          break;
        case "website:is_empty":
          conditions.push(isNull(organizations.website));
          break;
        case "website:is_not_empty":
          conditions.push(isNotNull(organizations.website));
          break;
        case "note:contains":
          conditions.push(ilike(organizations.note, containsPattern(text)));
          break;
        case "note:is_empty":
          conditions.push(isNull(organizations.note));
          break;
        case "note:is_not_empty":
          conditions.push(isNotNull(organizations.note));
          break;
        case "expertise:is_empty":
          conditions.push(not(hasExpertiseMatching(this.db)));
          break;
        case "expertise:is_not_empty":
          conditions.push(hasExpertiseMatching(this.db));
          break;
        case "person:is_empty":
          conditions.push(not(hasPersonMatching(this.db)));
          break;
        case "person:is_not_empty":
          conditions.push(hasPersonMatching(this.db));
          break;
      }
    }
    return and(...conditions);
  }

  private async hydrate(rows: OrganizationRow[], db: Executor = this.db): Promise<OrganizationDto[]> {
    const ids = rows.map((row) => row.id);
    const [peopleByOrganization, expertiseByOrganization] = await Promise.all([
      this.peopleFor(ids, db),
      expertiseRefsByOwner(
        db as Database,
        { table: organizationExpertise, ownerId: organizationExpertise.organizationId, expertiseId: organizationExpertise.expertiseId },
        ids,
      ),
    ]);
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      website: row.website,
      note: row.note,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      people: peopleByOrganization.get(row.id) ?? [],
      expertise: expertiseByOrganization.get(row.id) ?? [],
    }));
  }

  private async peopleFor(organizationIds: string[], db: Executor): Promise<Map<string, EntityRef[]>> {
    const result = new Map<string, EntityRef[]>();
    if (organizationIds.length === 0) return result;
    const rows = await db
      .select({ organizationId: peopleOrganizations.organizationId, id: people.id, name: people.name })
      .from(peopleOrganizations)
      .innerJoin(people, eq(people.id, peopleOrganizations.personId))
      .where(inArray(peopleOrganizations.organizationId, organizationIds))
      .orderBy(asc(sql`lower(${people.name})`), asc(people.id));
    for (const row of rows) {
      result.set(row.organizationId, [...(result.get(row.organizationId) ?? []), { id: row.id, name: row.name }]);
    }
    return result;
  }
}
