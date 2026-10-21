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
import type { Executor } from "../audit/audit.service.js";
import { CLOCK, type Clock } from "../common/clock/clock.js";
import { DATABASE, type Database } from "../common/database/database.module.js";
import { assertBelowLimit, LIMIT_MESSAGES, RELATION_LIMITS } from "../common/relation-limits.js";
import { containsPattern, groupFilters, type Page, type Sort } from "../common/listing/list-query.js";
import { expertiseRefsByOwner } from "../expertise/expertise-refs.js";
import { expertiseFields, expertiseItems } from "../expertise/expertise.schema.js";
import { organizations } from "../organizations/organizations.schema.js";
import { treasuryEntries } from "../treasury/treasury.schema.js";
import type {
  CreatePersonRequest,
  EntityRef,
  ExpenseRef,
  PeopleListQuery,
  PeopleOptionsDto,
  PeopleSortField,
  PersonCompletenessField,
  PersonDto,
  UpdatePersonRequest,
  VocabularyEntry,
} from "./people.contracts.js";
import {
  contactChannels,
  people,
  peopleExpertise,
  peopleOrganizations,
  personContactChannels,
  personSources,
  personStates,
} from "./people.schema.js";

/**
 * Overdue follow-up: the next follow-up (date and time) has passed, and the
 * person is neither Rejected nor Do not contact.
 */
const overdue = (now: Date) =>
  sql`coalesce(${people.nextFollowupAt} < ${now.toISOString()}::timestamptz and ${people.stateKey} is distinct from 'rejected' and not ${people.doNotContact}, false)`;

const hasAnyExpertise = sql`exists (select 1 from ${peopleExpertise} where ${peopleExpertise.personId} = ${people.id})`;
/** Incomplete: any of PERSON_COMPLETENESS empty. */
const incomplete = sql`(${people.stateKey} is null or ${people.sourceKey} is null or ${people.personalNote} is null or not ${hasAnyExpertise})`;

const personColumns = (now: Date) => ({
  id: people.id,
  personNumber: people.personNumber,
  notionPageId: people.notionPageId,
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
  otherSocials: people.otherSocials,
  wiseRecipientId: people.wiseRecipientId,
  nextFollowupAt: people.nextFollowupAt,
  firstContactOn: people.firstContactOn,
  lastContactOn: people.lastContactOn,
  aiRelevanceScore: people.aiRelevanceScore,
  relevanceScore: people.relevanceScore,
  lastFollowupAtLegacy: people.lastFollowupAtLegacy,
  followUpOverdue: sql<boolean>`${overdue(now)}`,
  archivedAt: people.archivedAt,
  createdAt: people.createdAt,
  updatedAt: people.updatedAt,
});

function selectPeople(db: Executor, now: Date) {
  return db
    .select(personColumns(now))
    .from(people)
    .leftJoin(personStates, eq(personStates.key, people.stateKey))
    .leftJoin(personSources, eq(personSources.key, people.sourceKey));
}

type PersonRow = Awaited<ReturnType<typeof selectPeople>>[number];

/** NULLS LAST in both directions, then id as a stable tiebreaker for pagination. */
function orderBy(sorts: readonly Sort<PeopleSortField>[]): SQL[] {
  const expression: Record<PeopleSortField, SQL> = {
    number: sql`${people.personNumber}`,
    name: sql`lower(${people.name})`,
    state: sql`${personStates.sortOrder}`,
    source: sql`${personSources.sortOrder}`,
    created: sql`${people.createdAt}`,
    updated: sql`${people.updatedAt}`,
    next_followup: sql`${people.nextFollowupAt}`,
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

/** The empty completeness fields of one person (same rule as `incomplete` above). */
export function personMissing(
  row: { stateKey: string | null; sourceKey: string | null; personalNote: string | null },
  hasExpertise: boolean,
): PersonCompletenessField[] {
  const missing: PersonCompletenessField[] = [];
  if (!row.stateKey) missing.push("State");
  if (!row.sourceKey) missing.push("Source");
  if (!row.personalNote) missing.push("Personal note");
  if (!hasExpertise) missing.push("Expertise");
  return missing;
}

/** The person columns copied by Duplicate (never the Notion page, the number, the legacy value or the archive state). */
const COPIED = [
  "name",
  "stateKey",
  "sourceKey",
  "personalNote",
  "doNotContact",
  "email",
  "phone",
  "website",
  "linkedin",
  "x",
  "otherContact",
  "otherSocials",
  "wiseRecipientId",
  "nextFollowupAt",
  "firstContactOn",
  "lastContactOn",
  "aiRelevanceScore",
  "relevanceScore",
] as const;

/**
 * People storage. Writes take the caller's transaction (`tx`): the service
 * reads the record before and after and records the audit event in the
 * same transaction.
 */
@Injectable()
export class PeopleRepository {
  constructor(@Inject(DATABASE) private readonly db: Database, @Inject(CLOCK) private readonly clock: Clock) {}

  async list(query: PeopleListQuery): Promise<Page<PersonDto>> {
    const where = this.whereClause(query);
    const [rows, [count]] = await Promise.all([
      selectPeople(this.db, this.clock())
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
    const rows = await selectPeople(db, this.clock()).where(eq(people.id, id)).limit(1);
    const [person] = await this.hydrate(rows, db);
    return person;
  }

  async exists(id: string): Promise<boolean> {
    const [row] = await this.db.select({ id: people.id }).from(people).where(eq(people.id, id)).limit(1);
    return row !== undefined;
  }

  async options(): Promise<Omit<PeopleOptionsDto, "aiScoreReadOnly">> {
    const [states, sources, channels] = await Promise.all([
      this.db.select({ key: personStates.key, label: personStates.label }).from(personStates).orderBy(asc(personStates.sortOrder)),
      this.db.select({ key: personSources.key, label: personSources.label }).from(personSources).orderBy(asc(personSources.sortOrder)),
      this.db.select({ key: contactChannels.key, label: contactChannels.label }).from(contactChannels).orderBy(asc(contactChannels.sortOrder)),
    ]);
    return { states, sources, contactChannels: channels };
  }

  async vocabularyExists(kind: "state" | "source", key: string): Promise<boolean> {
    const table = kind === "state" ? personStates : personSources;
    const [row] = await this.db.select({ key: table.key }).from(table).where(eq(table.key, key)).limit(1);
    return row !== undefined;
  }

  async countContactChannels(keys: readonly string[]): Promise<number> {
    if (keys.length === 0) return 0;
    const rows = await this.db.select({ key: contactChannels.key }).from(contactChannels).where(inArray(contactChannels.key, [...keys]));
    return rows.length;
  }

  /** The expenses among `ids` and their current recipients (for validating a link). */
  async expensesById(ids: readonly string[]) {
    if (ids.length === 0) return [];
    return this.db
      .select({
        id: treasuryEntries.id,
        entryType: treasuryEntries.entryType,
        recipientPersonId: treasuryEntries.recipientPersonId,
        recipientOrganizationId: treasuryEntries.recipientOrganizationId,
        reviewStatusKey: treasuryEntries.reviewStatusKey,
      })
      .from(treasuryEntries)
      .where(inArray(treasuryEntries.id, [...ids]));
  }

  async create(tx: Executor, input: CreatePersonRequest): Promise<string> {
    const [created] = await tx
      .insert(people)
      .values({ ...this.columnValues(input), name: input.name })
      .returning({ id: people.id });
    const id = created!.id;
    await this.replaceRelations(tx, id, input);
    return id;
  }

  async update(tx: Executor, id: string, input: UpdatePersonRequest): Promise<boolean> {
    const [updated] = await tx
      .update(people)
      .set({ ...this.columnValues(input), updatedAt: this.clock() })
      .where(eq(people.id, id))
      .returning({ id: people.id });
    if (!updated) return false;
    await this.replaceRelations(tx, id, input);
    return true;
  }

  /**
   * A new person with the same values and links, but no Notion page id
   * (it isn't that Notion page) and a fresh Person ID. Expenses keep their
   * one recipient (the original). Undefined if `id` is unknown.
   */
  async duplicate(tx: Executor, id: string): Promise<string | undefined> {
    const [source] = await tx.select().from(people).where(eq(people.id, id)).limit(1);
    if (!source) return undefined;
    const values = Object.fromEntries(COPIED.map((key) => [key, source[key]])) as Pick<typeof source, (typeof COPIED)[number]>;
    const [created] = await tx.insert(people).values(values).returning({ id: people.id });
    const copyId = created!.id;
    const organizationLinks = await tx.select({ organizationId: peopleOrganizations.organizationId }).from(peopleOrganizations).where(eq(peopleOrganizations.personId, id));
    if (organizationLinks.length > 0) await tx.insert(peopleOrganizations).values(organizationLinks.map((link) => ({ personId: copyId, ...link })));
    const expertiseLinks = await tx.select({ expertiseId: peopleExpertise.expertiseId }).from(peopleExpertise).where(eq(peopleExpertise.personId, id));
    if (expertiseLinks.length > 0) await tx.insert(peopleExpertise).values(expertiseLinks.map((link) => ({ personId: copyId, ...link })));
    const channelLinks = await tx.select({ channelKey: personContactChannels.channelKey }).from(personContactChannels).where(eq(personContactChannels.personId, id));
    if (channelLinks.length > 0) await tx.insert(personContactChannels).values(channelLinks.map((link) => ({ personId: copyId, ...link })));
    return copyId;
  }

  /**
   * Idempotent: linking twice is a no-op. Callers check that both sides
   * exist first. A new link past the person's cap is refused (400).
   */
  async link(tx: Executor, kind: "organization" | "expertise", personId: string, targetId: string): Promise<void> {
    if (kind === "organization") {
      await assertBelowLimit(
        tx as Database,
        peopleOrganizations,
        peopleOrganizations.personId,
        personId,
        and(eq(peopleOrganizations.personId, personId), eq(peopleOrganizations.organizationId, targetId))!,
        RELATION_LIMITS.organizationsPerPerson,
        { path: "organizationIds", message: LIMIT_MESSAGES.personOrganizations },
      );
      await tx.insert(peopleOrganizations).values({ personId, organizationId: targetId }).onConflictDoNothing();
    } else {
      await assertBelowLimit(
        tx as Database,
        peopleExpertise,
        peopleExpertise.personId,
        personId,
        and(eq(peopleExpertise.personId, personId), eq(peopleExpertise.expertiseId, targetId))!,
        RELATION_LIMITS.expertise,
        { path: "expertiseIds", message: LIMIT_MESSAGES.personExpertise },
      );
      await tx.insert(peopleExpertise).values({ personId, expertiseId: targetId }).onConflictDoNothing();
    }
    await tx.update(people).set({ updatedAt: this.clock() }).where(eq(people.id, personId));
  }

  async unlink(tx: Executor, kind: "organization" | "expertise", personId: string, targetId: string): Promise<void> {
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
    if (removed.length > 0) await tx.update(people).set({ updatedAt: this.clock() }).where(eq(people.id, personId));
  }

  /** Archive (by `adminId`) or restore (null). False when the person doesn't exist. */
  async setArchived(tx: Executor, id: string, adminId: string | null): Promise<boolean> {
    const [row] = await tx
      .update(people)
      .set(adminId ? { archivedAt: this.clock(), archivedById: adminId } : { archivedAt: null, archivedById: null })
      .where(eq(people.id, id))
      .returning({ id: people.id });
    return row !== undefined;
  }

  /** Permanent delete: links go with the person (cascade); expenses paid to them block it (their recipient). */
  async delete(tx: Executor, id: string): Promise<void> {
    await tx.delete(people).where(eq(people.id, id));
  }

  async hasExpenses(id: string): Promise<boolean> {
    const [row] = await this.db.select({ id: treasuryEntries.id }).from(treasuryEntries).where(eq(treasuryEntries.recipientPersonId, id)).limit(1);
    return row !== undefined;
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
    if (input.otherSocials !== undefined) values.otherSocials = input.otherSocials;
    if (input.wiseRecipientId !== undefined) values.wiseRecipientId = input.wiseRecipientId;
    if (input.nextFollowupAt !== undefined) values.nextFollowupAt = input.nextFollowupAt === null ? null : new Date(input.nextFollowupAt);
    if (input.firstContactOn !== undefined) values.firstContactOn = input.firstContactOn;
    if (input.lastContactOn !== undefined) values.lastContactOn = input.lastContactOn;
    if (input.aiRelevanceScore !== undefined) values.aiRelevanceScore = input.aiRelevanceScore;
    if (input.relevanceScore !== undefined) values.relevanceScore = input.relevanceScore;
    return values;
  }

  /** Replaces a relationship set when (and only when) the request includes it. */
  private async replaceRelations(tx: Executor, personId: string, input: UpdatePersonRequest) {
    if (input.organizationIds !== undefined) {
      await tx.delete(peopleOrganizations).where(eq(peopleOrganizations.personId, personId));
      if (input.organizationIds.length > 0) {
        await tx.insert(peopleOrganizations).values(input.organizationIds.map((organizationId) => ({ personId, organizationId })));
      }
    }
    if (input.expertiseIds !== undefined) {
      await tx.delete(peopleExpertise).where(eq(peopleExpertise.personId, personId));
      if (input.expertiseIds.length > 0) {
        await tx.insert(peopleExpertise).values(input.expertiseIds.map((expertiseId) => ({ personId, expertiseId })));
      }
    }
    if (input.contactChannelKeys !== undefined) {
      await tx.delete(personContactChannels).where(eq(personContactChannels.personId, personId));
      if (input.contactChannelKeys.length > 0) {
        await tx.insert(personContactChannels).values(input.contactChannelKeys.map((channelKey) => ({ personId, channelKey })));
      }
    }
    if (input.expenseIds !== undefined) {
      // Expenses no longer listed lose this recipient; listed ones get it (the service checked they're free).
      await tx
        .update(treasuryEntries)
        .set({ recipientPersonId: null, updatedAt: this.clock() })
        .where(
          and(
            eq(treasuryEntries.recipientPersonId, personId),
            input.expenseIds.length > 0 ? not(inArray(treasuryEntries.id, input.expenseIds)) : undefined,
          ),
        );
      if (input.expenseIds.length > 0) {
        await tx
          .update(treasuryEntries)
          .set({ recipientPersonId: personId, updatedAt: this.clock() })
          .where(and(inArray(treasuryEntries.id, input.expenseIds), isNull(treasuryEntries.recipientPersonId)));
      }
    }
  }

  private whereClause(query: PeopleListQuery): SQL | undefined {
    const conditions: (SQL | undefined)[] = [];
    // Archived people are only in the "Archived" view (decision 12).
    const archivedFilter = query.filters.find((filter) => filter.field === "archived");
    conditions.push(archivedFilter?.value === true ? isNotNull(people.archivedAt) : isNull(people.archivedAt));

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
          ilike(people.otherSocials, pattern),
          hasOrganizationMatching(this.db, ilike(organizations.name, pattern)),
          hasExpertiseMatching(this.db, ilike(expertiseItems.name, pattern)),
        ),
      );
    }

    const { anyOf, all } = groupFilters(query.filters.filter((filter) => filter.field !== "archived"));
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
      } else if (field === "expertise_field") {
        conditions.push(hasExpertiseMatching(this.db, inArray(expertiseItems.fieldId, strings)));
      } else if (field === "expertise_domain") {
        conditions.push(
          hasExpertiseMatching(
            this.db,
            sql`${expertiseItems.fieldId} in (select ${expertiseFields.id} from ${expertiseFields} where ${inArray(expertiseFields.domainId, strings)})`,
          ),
        );
      } else if (field === "follow_up") {
        conditions.push(overdue(this.clock()));
      } else if (field === "completeness") {
        const wanted = new Set(strings);
        if (!(wanted.has("complete") && wanted.has("incomplete"))) conditions.push(wanted.has("incomplete") ? incomplete : sql`not ${incomplete}`);
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
    const [organizationsByPerson, expertiseByPerson, channelsByPerson, expensesByPerson] = await Promise.all([
      this.organizationsFor(ids, db),
      expertiseRefsByOwner(db as Database, { table: peopleExpertise, ownerId: peopleExpertise.personId, expertiseId: peopleExpertise.expertiseId }, ids),
      this.channelsFor(ids, db),
      this.expensesFor(ids, db),
    ]);
    return rows.map((row) => ({
      id: row.id,
      personNumber: row.personNumber,
      notionPageId: row.notionPageId,
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
      otherSocials: row.otherSocials,
      wiseRecipientId: row.wiseRecipientId,
      nextFollowupAt: row.nextFollowupAt?.toISOString() ?? null,
      firstContactOn: row.firstContactOn,
      lastContactOn: row.lastContactOn,
      aiRelevanceScore: row.aiRelevanceScore,
      relevanceScore: row.relevanceScore,
      contactChannels: channelsByPerson.get(row.id) ?? [],
      expenses: expensesByPerson.get(row.id) ?? [],
      lastFollowupAtLegacy: row.lastFollowupAtLegacy?.toISOString() ?? null,
      followUpOverdue: row.followUpOverdue === true,
      archivedAt: row.archivedAt?.toISOString() ?? null,
      missing: personMissing(row, (expertiseByPerson.get(row.id) ?? []).length > 0),
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
    for (const row of rows) result.set(row.personId, [...(result.get(row.personId) ?? []), { id: row.id, name: row.name }]);
    return result;
  }

  private async channelsFor(personIds: string[], db: Executor): Promise<Map<string, VocabularyEntry[]>> {
    const result = new Map<string, VocabularyEntry[]>();
    if (personIds.length === 0) return result;
    const rows = await db
      .select({ personId: personContactChannels.personId, key: contactChannels.key, label: contactChannels.label })
      .from(personContactChannels)
      .innerJoin(contactChannels, eq(contactChannels.key, personContactChannels.channelKey))
      .where(inArray(personContactChannels.personId, personIds))
      .orderBy(asc(contactChannels.sortOrder));
    for (const row of rows) result.set(row.personId, [...(result.get(row.personId) ?? []), { key: row.key, label: row.label }]);
    return result;
  }

  private async expensesFor(personIds: string[], db: Executor): Promise<Map<string, ExpenseRef[]>> {
    const result = new Map<string, ExpenseRef[]>();
    if (personIds.length === 0) return result;
    const rows = await db
      .select({
        personId: treasuryEntries.recipientPersonId,
        id: treasuryEntries.id,
        entryNumber: treasuryEntries.entryNumber,
        currency: treasuryEntries.currency,
        grossAmount: treasuryEntries.grossAmount,
      })
      .from(treasuryEntries)
      .where(and(inArray(treasuryEntries.recipientPersonId, personIds), eq(treasuryEntries.entryType, "expense")))
      .orderBy(asc(treasuryEntries.entryNumber));
    for (const { personId, ...expense } of rows) result.set(personId!, [...(result.get(personId!) ?? []), expense]);
    return result;
  }
}
