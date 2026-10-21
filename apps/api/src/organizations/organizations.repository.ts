import { Inject, Injectable } from "@nestjs/common";
import { and, asc, eq, exists, ilike, inArray, isNotNull, isNull, not, notIlike, or, sql, type SQL } from "drizzle-orm";
import { DATABASE, type Database } from "../common/database/database.module.js";
import { assertBelowLimit, LIMIT_MESSAGES, RELATION_LIMITS } from "../common/relation-limits.js";
import { containsPattern, groupFilters, type Page, type Sort } from "../common/listing/list-query.js";
import { expertiseRefsByOwner } from "../expertise/expertise-refs.js";
import { expertiseItems } from "../expertise/expertise.schema.js";
import type { EntityRef } from "../people/people.contracts.js";
import { people, peopleOrganizations } from "../people/people.schema.js";
import type {
  CreateOrganizationRequest,
  OrganizationCompletenessField,
  OrganizationDto,
  OrganizationSortField,
  OrganizationsListQuery,
  UpdateOrganizationRequest,
} from "./organizations.contracts.js";
import { organizationExpertise, organizations } from "./organizations.schema.js";
import { treasuryEntries } from "../treasury/treasury.schema.js";

export type Executor = Pick<Database, "select" | "insert" | "update" | "delete">;

const peopleCount = sql<number>`(select count(*)::int from ${peopleOrganizations} where ${peopleOrganizations.organizationId} = ${organizations.id})`;

function selectOrganizations(db: Executor) {
  return db
    .select({
      id: organizations.id,
      orgNumber: organizations.orgNumber,
      notionPageId: organizations.notionPageId,
      name: organizations.name,
      description: organizations.description,
      website: organizations.website,
      email: organizations.email,
      wiseRecipientId: organizations.wiseRecipientId,
      archivedAt: organizations.archivedAt,
      createdAt: organizations.createdAt,
      updatedAt: organizations.updatedAt,
    })
    .from(organizations);
}
type OrganizationRow = Awaited<ReturnType<typeof selectOrganizations>>[number];

function orderBy(sorts: readonly Sort<OrganizationSortField>[]): SQL[] {
  const expression: Record<OrganizationSortField, SQL> = {
    number: sql`${organizations.orgNumber}`,
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

const hasAnyExpertise = sql`exists (select 1 from ${organizationExpertise} where ${organizationExpertise.organizationId} = ${organizations.id})`;
/** Incomplete: any of ORGANIZATION_COMPLETENESS empty. */
const incomplete = sql`(${organizations.description} is null or ${organizations.website} is null or ${organizations.email} is null or ${organizations.wiseRecipientId} is null or not ${hasAnyExpertise})`;

/** The empty completeness fields of one organization (same rule as `incomplete`). */
export function organizationMissing(
  row: { description: string | null; website: string | null; email: string | null; wiseRecipientId: string | null },
  hasExpertise: boolean,
): OrganizationCompletenessField[] {
  const missing: OrganizationCompletenessField[] = [];
  if (!row.description) missing.push("Description");
  if (!row.website) missing.push("Website");
  if (!row.email) missing.push("Email");
  if (!row.wiseRecipientId) missing.push("Wise recipient ID");
  if (!hasExpertise) missing.push("Expertise");
  return missing;
}

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

  /** Writes take the caller's transaction: the service audits in the same one. */
  async create(tx: Executor, input: CreateOrganizationRequest): Promise<string> {
    const [created] = await tx
      .insert(organizations)
      .values({ ...this.columnValues(input), name: input.name })
      .returning({ id: organizations.id });
    await this.replaceExpertise(tx, created!.id, input.expertiseIds);
    return created!.id;
  }

  async update(tx: Executor, id: string, input: UpdateOrganizationRequest): Promise<boolean> {
    const [updated] = await tx
      .update(organizations)
      .set({ ...this.columnValues(input), updatedAt: new Date() })
      .where(eq(organizations.id, id))
      .returning({ id: organizations.id });
    if (!updated) return false;
    await this.replaceExpertise(tx, id, input.expertiseIds);
    return true;
  }

  /**
   * A new organization with the same values and expertise, but no Notion
   * page id and a fresh Organization ID. People aren't copied: each link
   * counts toward that person's 5-organization limit, so it's a choice to
   * make on the copy. Undefined if `id` is unknown.
   */
  async duplicate(tx: Executor, id: string): Promise<string | undefined> {
    {
      const [source] = await tx.select().from(organizations).where(eq(organizations.id, id)).limit(1);
      if (!source) return undefined;
      const { name, description, website, email, wiseRecipientId } = source;
      const [created] = await tx
        .insert(organizations)
        .values({ name, description, website, email, wiseRecipientId })
        .returning({ id: organizations.id });
      const copyId = created!.id;
      const expertiseLinks = await tx
        .select({ expertiseId: organizationExpertise.expertiseId })
        .from(organizationExpertise)
        .where(eq(organizationExpertise.organizationId, id));
      if (expertiseLinks.length > 0) await tx.insert(organizationExpertise).values(expertiseLinks.map((link) => ({ organizationId: copyId, ...link })));
      return copyId;
    }
  }

  async linkExpertise(tx: Executor, organizationId: string, expertiseId: string): Promise<void> {
    {
      await assertBelowLimit(
        tx,
        organizationExpertise,
        organizationExpertise.organizationId,
        organizationId,
        and(eq(organizationExpertise.organizationId, organizationId), eq(organizationExpertise.expertiseId, expertiseId))!,
        RELATION_LIMITS.expertise,
        { path: "expertiseIds", message: LIMIT_MESSAGES.organizationExpertise },
      );
      await tx.insert(organizationExpertise).values({ organizationId, expertiseId }).onConflictDoNothing();
      await tx.update(organizations).set({ updatedAt: new Date() }).where(eq(organizations.id, organizationId));
    }
  }

  async unlinkExpertise(tx: Executor, organizationId: string, expertiseId: string): Promise<void> {
    {
      const removed = await tx
        .delete(organizationExpertise)
        .where(and(eq(organizationExpertise.organizationId, organizationId), eq(organizationExpertise.expertiseId, expertiseId)))
        .returning({ id: organizationExpertise.organizationId });
      if (removed.length > 0) await tx.update(organizations).set({ updatedAt: new Date() }).where(eq(organizations.id, organizationId));
    }
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
  async linkPerson(tx: Executor, organizationId: string, personId: string): Promise<void> {
    {
      // The cap belongs to the person: at most 5 organizations, whichever side links.
      await assertBelowLimit(
        tx,
        peopleOrganizations,
        peopleOrganizations.personId,
        personId,
        and(eq(peopleOrganizations.personId, personId), eq(peopleOrganizations.organizationId, organizationId))!,
        RELATION_LIMITS.organizationsPerPerson,
        { path: "personIds", message: `This person already has ${RELATION_LIMITS.organizationsPerPerson} organizations (the maximum).` },
      );
      const added = await tx
        .insert(peopleOrganizations)
        .values({ personId, organizationId })
        .onConflictDoNothing()
        .returning({ personId: peopleOrganizations.personId });
      if (added.length > 0) await this.touchBoth(tx, organizationId, personId);
    }
  }

  async unlinkPerson(tx: Executor, organizationId: string, personId: string): Promise<void> {
    {
      const removed = await tx
        .delete(peopleOrganizations)
        .where(and(eq(peopleOrganizations.organizationId, organizationId), eq(peopleOrganizations.personId, personId)))
        .returning({ personId: peopleOrganizations.personId });
      if (removed.length > 0) await this.touchBoth(tx, organizationId, personId);
    }
  }

  /** Archive (by `adminId`) or restore (null). */
  async setArchived(tx: Executor, id: string, adminId: string | null): Promise<void> {
    await tx
      .update(organizations)
      .set(adminId ? { archivedAt: new Date(), archivedById: adminId } : { archivedAt: null, archivedById: null })
      .where(eq(organizations.id, id));
  }

  /** Permanent delete: links go with it (cascade); expenses paid to it block it (their recipient). */
  async delete(tx: Executor, id: string): Promise<void> {
    await tx.delete(organizations).where(eq(organizations.id, id));
  }

  async hasExpenses(id: string): Promise<boolean> {
    const [row] = await this.db.select({ id: treasuryEntries.id }).from(treasuryEntries).where(eq(treasuryEntries.recipientOrganizationId, id)).limit(1);
    return row !== undefined;
  }

  /** Only the fields present in the request; `null` clears a field. */
  private columnValues(input: UpdateOrganizationRequest) {
    const values: Partial<typeof organizations.$inferInsert> = {};
    if (input.name !== undefined) values.name = input.name;
    if (input.description !== undefined) values.description = input.description;
    if (input.website !== undefined) values.website = input.website;
    if (input.email !== undefined) values.email = input.email;
    if (input.wiseRecipientId !== undefined) values.wiseRecipientId = input.wiseRecipientId;
    return values;
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
    // Archived organizations are only in the "Archived" view (decision 12).
    const archivedFilter = query.filters.find((filter) => filter.field === "archived");
    conditions.push(archivedFilter?.value === true ? isNotNull(organizations.archivedAt) : isNull(organizations.archivedAt));
    if (query.search) {
      const pattern = containsPattern(query.search);
      conditions.push(
        or(
          ilike(organizations.name, pattern),
          ilike(organizations.website, pattern),
          ilike(organizations.description, pattern),
          ilike(organizations.email, pattern),
          hasExpertiseMatching(this.db, ilike(expertiseItems.name, pattern)),
          hasPersonMatching(this.db, ilike(people.name, pattern)),
        ),
      );
    }
    const { anyOf, all } = groupFilters(query.filters.filter((filter) => filter.field !== "archived"));
    for (const [field, values] of anyOf) {
      const ids = values.map(String);
      if (field === "expertise") conditions.push(hasExpertiseMatching(this.db, inArray(organizationExpertise.expertiseId, ids)));
      if (field === "person") conditions.push(hasPersonMatching(this.db, inArray(peopleOrganizations.personId, ids)));
      if (field === "completeness" && !(ids.includes("complete") && ids.includes("incomplete"))) {
        conditions.push(ids.includes("incomplete") ? incomplete : sql`not ${incomplete}`);
      }
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
        case "description:contains":
          conditions.push(ilike(organizations.description, containsPattern(text)));
          break;
        case "description:is_empty":
          conditions.push(isNull(organizations.description));
          break;
        case "description:is_not_empty":
          conditions.push(isNotNull(organizations.description));
          break;
        case "email:contains":
          conditions.push(ilike(organizations.email, containsPattern(text)));
          break;
        case "email:is_empty":
          conditions.push(isNull(organizations.email));
          break;
        case "email:is_not_empty":
          conditions.push(isNotNull(organizations.email));
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
      orgNumber: row.orgNumber,
      notionPageId: row.notionPageId,
      name: row.name,
      description: row.description,
      website: row.website,
      email: row.email,
      wiseRecipientId: row.wiseRecipientId,
      missing: organizationMissing(row, (expertiseByOrganization.get(row.id) ?? []).length > 0),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      archivedAt: row.archivedAt?.toISOString() ?? null,
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
