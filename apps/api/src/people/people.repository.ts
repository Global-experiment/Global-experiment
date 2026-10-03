import { Inject, Injectable } from "@nestjs/common";
import {
  and,
  asc,
  eq,
  exists,
  ilike,
  inArray,
  isNotNull,
  isNull,
  ne,
  not,
  notIlike,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { DATABASE, type Database } from "../common/database/database.module.js";
import { containsPattern, groupFilters, type Page, type Sort } from "../common/listing/list-query.js";
import { expertiseRefsByOwner } from "../expertise/expertise-refs.js";
import { expertiseItems } from "../expertise/expertise.schema.js";
import { organizations } from "../organizations/organizations.schema.js";
import type {
  CreatePersonRequest,
  EntityRef,
  PeopleListQuery,
  PeopleOptionsDto,
  PeopleSortField,
  PersonDto,
  UpdatePersonRequest,
} from "./people.contracts.js";
import { people, peopleExpertise, peopleOrganizations, personSources, personStates } from "./people.schema.js";

type Executor = Pick<Database, "select" | "insert" | "update" | "delete">;

const personColumns = {
  id: people.id,
  name: people.name,
  stateKey: people.stateKey,
  stateLabel: personStates.label,
  sourceKey: people.sourceKey,
  sourceLabel: personSources.label,
  personalNote: people.personalNote,
  doNotContact: people.doNotContact,
  email: people.email,
  phone: people.phone,
  website: people.website,
  linkedin: people.linkedin,
  x: people.x,
  otherContact: people.otherContact,
  lastFollowupAt: people.lastFollowupAt,
  createdAt: people.createdAt,
  updatedAt: people.updatedAt,
};

function selectPeople(db: Executor) {
  return db
    .select(personColumns)
    .from(people)
    .leftJoin(personStates, eq(personStates.key, people.stateKey))
    .leftJoin(personSources, eq(personSources.key, people.sourceKey));
}

type PersonRow = Awaited<ReturnType<typeof selectPeople>>[number];

/** NULLS LAST in both directions, then id as a stable tiebreaker for pagination. */
function orderBy(sorts: readonly Sort<PeopleSortField>[]): SQL[] {
  const expression: Record<PeopleSortField, SQL> = {
    name: sql`lower(${people.name})`,
    state: sql`${personStates.sortOrder}`,
    source: sql`${personSources.sortOrder}`,
    created: sql`${people.createdAt}`,
    updated: sql`${people.updatedAt}`,
    last_followup: sql`${people.lastFollowupAt}`,
  };
  return [
    ...sorts.map(({ field, direction }) =>
      direction === "asc" ? sql`${expression[field]} asc nulls last` : sql`${expression[field]} desc nulls last`,
    ),
    asc(people.id),
  ];
}

const hasOrganizationMatching = (db: Executor, condition?: SQL) =>
  exists(
    db
      .select({ one: sql`1` })
      .from(peopleOrganizations)
      .innerJoin(organizations, eq(organizations.id, peopleOrganizations.organizationId))
      .where(and(eq(peopleOrganizations.personId, people.id), condition)),
  );

const hasExpertiseMatching = (db: Executor, condition?: SQL) =>
  exists(
    db
      .select({ one: sql`1` })
      .from(peopleExpertise)
      .innerJoin(expertiseItems, eq(expertiseItems.id, peopleExpertise.expertiseId))
      .where(and(eq(peopleExpertise.personId, people.id), condition)),
  );

@Injectable()
export class PeopleRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async list(query: PeopleListQuery): Promise<Page<PersonDto>> {
    const where = this.whereClause(query);
    const [rows, [count]] = await Promise.all([
      selectPeople(this.db)
        .where(where)
        .orderBy(...orderBy(query.sort))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize),
      this.db.select({ total: sql<number>`count(*)::int` }).from(people).where(where),
    ]);
    return {
      items: await this.hydrate(rows),
      page: query.page,
      pageSize: query.pageSize,
      total: count?.total ?? 0,
    };
  }

  async findById(id: string, db: Executor = this.db): Promise<PersonDto | undefined> {
    const rows = await selectPeople(db).where(eq(people.id, id)).limit(1);
    const [person] = await this.hydrate(rows, db);
    return person;
  }

  async exists(id: string): Promise<boolean> {
    const [row] = await this.db.select({ id: people.id }).from(people).where(eq(people.id, id)).limit(1);
    return row !== undefined;
  }

  async options(): Promise<PeopleOptionsDto> {
    const [states, sources] = await Promise.all([
      this.db.select({ key: personStates.key, label: personStates.label }).from(personStates).orderBy(asc(personStates.sortOrder)),
      this.db.select({ key: personSources.key, label: personSources.label }).from(personSources).orderBy(asc(personSources.sortOrder)),
    ]);
    return { states, sources };
  }

  async vocabularyExists(kind: "state" | "source", key: string): Promise<boolean> {
    const table = kind === "state" ? personStates : personSources;
    const [row] = await this.db.select({ key: table.key }).from(table).where(eq(table.key, key)).limit(1);
    return row !== undefined;
  }

  async create(input: CreatePersonRequest): Promise<PersonDto> {
    return this.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(people)
        .values({ ...this.columnValues(input), name: input.name })
        .returning({ id: people.id });
      const id = created!.id;
      await this.replaceRelations(tx, id, input);
      return (await this.findById(id, tx))!;
    });
  }

  async update(id: string, input: UpdatePersonRequest): Promise<PersonDto | undefined> {
    return this.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(people)
        .set({ ...this.columnValues(input), updatedAt: new Date() })
        .where(eq(people.id, id))
        .returning({ id: people.id });
      if (!updated) return undefined;
      await this.replaceRelations(tx, id, input);
      return this.findById(id, tx);
    });
  }

  /** Idempotent: linking twice is a no-op. Callers check that both sides exist first. */
  async link(kind: "organization" | "expertise", personId: string, targetId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      if (kind === "organization") {
        await tx.insert(peopleOrganizations).values({ personId, organizationId: targetId }).onConflictDoNothing();
      } else {
        await tx.insert(peopleExpertise).values({ personId, expertiseId: targetId }).onConflictDoNothing();
      }
      await tx.update(people).set({ updatedAt: new Date() }).where(eq(people.id, personId));
    });
  }

  async unlink(kind: "organization" | "expertise", personId: string, targetId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const removed =
        kind === "organization"
          ? await tx
              .delete(peopleOrganizations)
              .where(and(eq(peopleOrganizations.personId, personId), eq(peopleOrganizations.organizationId, targetId)))
              .returning({ personId: peopleOrganizations.personId })
          : await tx
              .delete(peopleExpertise)
              .where(and(eq(peopleExpertise.personId, personId), eq(peopleExpertise.expertiseId, targetId)))
              .returning({ personId: peopleExpertise.personId });
      if (removed.length > 0) await tx.update(people).set({ updatedAt: new Date() }).where(eq(people.id, personId));
    });
  }

  private columnValues(input: UpdatePersonRequest) {
    const values: Partial<typeof people.$inferInsert> = {};
    if (input.name !== undefined) values.name = input.name;
    if (input.stateKey !== undefined) values.stateKey = input.stateKey;
    if (input.sourceKey !== undefined) values.sourceKey = input.sourceKey;
    if (input.personalNote !== undefined) values.personalNote = input.personalNote;
    if (input.doNotContact !== undefined) values.doNotContact = input.doNotContact;
    if (input.email !== undefined) values.email = input.email;
    if (input.phone !== undefined) values.phone = input.phone;
    if (input.website !== undefined) values.website = input.website;
    if (input.linkedin !== undefined) values.linkedin = input.linkedin;
    if (input.x !== undefined) values.x = input.x;
    if (input.otherContact !== undefined) values.otherContact = input.otherContact;
    if (input.lastFollowupAt !== undefined) {
      values.lastFollowupAt = input.lastFollowupAt === null ? null : new Date(input.lastFollowupAt);
    }
    return values;
  }

  /** Replaces a relationship set when (and only when) the request includes it. */
  private async replaceRelations(tx: Executor, personId: string, input: UpdatePersonRequest) {
    if (input.organizationIds !== undefined) {
      await tx.delete(peopleOrganizations).where(eq(peopleOrganizations.personId, personId));
      if (input.organizationIds.length > 0) {
        await tx
          .insert(peopleOrganizations)
          .values(input.organizationIds.map((organizationId) => ({ personId, organizationId })));
      }
    }
    if (input.expertiseIds !== undefined) {
      await tx.delete(peopleExpertise).where(eq(peopleExpertise.personId, personId));
      if (input.expertiseIds.length > 0) {
        await tx.insert(peopleExpertise).values(input.expertiseIds.map((expertiseId) => ({ personId, expertiseId })));
      }
    }
  }

  private whereClause(query: PeopleListQuery): SQL | undefined {
    const conditions: (SQL | undefined)[] = [];

    if (query.search) {
      const pattern = containsPattern(query.search);
      conditions.push(
        or(
          ilike(people.name, pattern),
          ilike(people.personalNote, pattern),
          ilike(people.email, pattern),
          ilike(people.phone, pattern),
          ilike(people.website, pattern),
          ilike(people.linkedin, pattern),
          ilike(people.x, pattern),
          ilike(people.otherContact, pattern),
          hasOrganizationMatching(this.db, ilike(organizations.name, pattern)),
          hasExpertiseMatching(this.db, ilike(expertiseItems.name, pattern)),
        ),
      );
    }

    const { anyOf, all } = groupFilters(query.filters);
    for (const [field, values] of anyOf) {
      const strings = values.map(String);
      if (field === "state") conditions.push(inArray(people.stateKey, strings));
      else if (field === "source") conditions.push(inArray(people.sourceKey, strings));
      else if (field === "organization") {
        conditions.push(hasOrganizationMatching(this.db, inArray(peopleOrganizations.organizationId, strings)));
      } else if (field === "expertise") {
        conditions.push(hasExpertiseMatching(this.db, inArray(peopleExpertise.expertiseId, strings)));
      } else if (field === "do_not_contact") {
        conditions.push(or(...values.map((value) => eq(people.doNotContact, value === true))));
      }
    }

    for (const { field, operator, value } of all) {
      const text = typeof value === "string" ? value : "";
      switch (`${field}:${operator}`) {
        case "state:is_not":
          conditions.push(or(isNull(people.stateKey), ne(people.stateKey, text)));
          break;
        case "state:is_empty":
          conditions.push(isNull(people.stateKey));
          break;
        case "state:is_not_empty":
          conditions.push(isNotNull(people.stateKey));
          break;
        case "source:is_not":
          conditions.push(or(isNull(people.sourceKey), ne(people.sourceKey, text)));
          break;
        case "source:is_empty":
          conditions.push(isNull(people.sourceKey));
          break;
        case "source:is_not_empty":
          conditions.push(isNotNull(people.sourceKey));
          break;
        case "name:contains":
          conditions.push(ilike(people.name, containsPattern(text)));
          break;
        case "name:not_contains":
          conditions.push(notIlike(people.name, containsPattern(text)));
          break;
        case "personal_note:contains":
          conditions.push(ilike(people.personalNote, containsPattern(text)));
          break;
        case "personal_note:not_contains":
          conditions.push(or(isNull(people.personalNote), notIlike(people.personalNote, containsPattern(text))));
          break;
        case "personal_note:is_empty":
          conditions.push(isNull(people.personalNote));
          break;
        case "personal_note:is_not_empty":
          conditions.push(isNotNull(people.personalNote));
          break;
        case "email:contains":
          conditions.push(ilike(people.email, containsPattern(text)));
          break;
        case "email:is_empty":
          conditions.push(isNull(people.email));
          break;
        case "email:is_not_empty":
          conditions.push(isNotNull(people.email));
          break;
        case "organization:is_empty":
          conditions.push(not(hasOrganizationMatching(this.db)));
          break;
        case "organization:is_not_empty":
          conditions.push(hasOrganizationMatching(this.db));
          break;
        case "expertise:is_empty":
          conditions.push(not(hasExpertiseMatching(this.db)));
          break;
        case "expertise:is_not_empty":
          conditions.push(hasExpertiseMatching(this.db));
          break;
      }
    }
    return and(...conditions);
  }

  private async hydrate(rows: PersonRow[], db: Executor = this.db): Promise<PersonDto[]> {
    const ids = rows.map((row) => row.id);
    const [organizationsByPerson, expertiseByPerson] = await Promise.all([
      this.organizationsFor(ids, db),
      expertiseRefsByOwner(
        db as Database,
        { table: peopleExpertise, ownerId: peopleExpertise.personId, expertiseId: peopleExpertise.expertiseId },
        ids,
      ),
    ]);
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      state: row.stateKey ? { key: row.stateKey, label: row.stateLabel ?? row.stateKey } : null,
      source: row.sourceKey ? { key: row.sourceKey, label: row.sourceLabel ?? row.sourceKey } : null,
      personalNote: row.personalNote,
      doNotContact: row.doNotContact,
      email: row.email,
      phone: row.phone,
      website: row.website,
      linkedin: row.linkedin,
      x: row.x,
      otherContact: row.otherContact,
      lastFollowupAt: row.lastFollowupAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      organizations: organizationsByPerson.get(row.id) ?? [],
      expertise: expertiseByPerson.get(row.id) ?? [],
    }));
  }

  private async organizationsFor(personIds: string[], db: Executor): Promise<Map<string, EntityRef[]>> {
    const result = new Map<string, EntityRef[]>();
    if (personIds.length === 0) return result;
    const rows = await db
      .select({ personId: peopleOrganizations.personId, id: organizations.id, name: organizations.name })
      .from(peopleOrganizations)
      .innerJoin(organizations, eq(organizations.id, peopleOrganizations.organizationId))
      .where(inArray(peopleOrganizations.personId, personIds))
      .orderBy(asc(sql`lower(${organizations.name})`), asc(organizations.id));
    for (const row of rows) {
      result.set(row.personId, [...(result.get(row.personId) ?? []), { id: row.id, name: row.name }]);
    }
    return result;
  }
}
