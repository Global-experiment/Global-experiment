import { Inject, Injectable } from "@nestjs/common";
import { and, asc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { DATABASE, type Database } from "../common/database/database.module.js";
import { containsPattern, escapeLike, type Page } from "../common/listing/list-query.js";
import { organizationExpertise } from "../organizations/organizations.schema.js";
import { peopleExpertise } from "../people/people.schema.js";
import type { ExpertiseLevel, ExpertiseSearchItemDto, ExpertiseSearchQuery, ExpertiseTreeDto } from "./expertise.contracts.js";
import { expertiseDomains, expertiseFields, expertiseItems, expertiseTeams, taxonomyStatuses, teams } from "./expertise.schema.js";

const TABLE = { domain: expertiseDomains, field: expertiseFields, expertise: expertiseItems } as const;

@Injectable()
export class ExpertiseRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** The whole taxonomy in four ordered queries, with how often each expertise is used. */
  async tree(): Promise<ExpertiseTreeDto> {
    const [domains, fields, items, teamLinks] = await Promise.all([
      this.db
        .select({
          id: expertiseDomains.id,
          name: expertiseDomains.name,
          stableId: expertiseDomains.stableId,
          statusKey: expertiseDomains.statusKey,
          statusLabel: taxonomyStatuses.label,
        })
        .from(expertiseDomains)
        .leftJoin(taxonomyStatuses, eq(taxonomyStatuses.key, expertiseDomains.statusKey))
        .orderBy(asc(sql`lower(${expertiseDomains.name})`)),
      this.db
        .select({
          id: expertiseFields.id,
          name: expertiseFields.name,
          domainId: expertiseFields.domainId,
          stableId: expertiseFields.stableId,
          statusKey: expertiseFields.statusKey,
          statusLabel: taxonomyStatuses.label,
        })
        .from(expertiseFields)
        .leftJoin(taxonomyStatuses, eq(taxonomyStatuses.key, expertiseFields.statusKey))
        .orderBy(asc(sql`lower(${expertiseFields.name})`)),
      this.db
        .select({
          id: expertiseItems.id,
          name: expertiseItems.name,
          fieldId: expertiseItems.fieldId,
          stableId: expertiseItems.stableId,
          statusKey: expertiseItems.statusKey,
          statusLabel: taxonomyStatuses.label,
          peopleCount: sql<number>`(select count(*)::int from ${peopleExpertise} where ${peopleExpertise.expertiseId} = ${expertiseItems.id})`,
          organizationCount: sql<number>`(select count(*)::int from ${organizationExpertise} where ${organizationExpertise.expertiseId} = ${expertiseItems.id})`,
        })
        .from(expertiseItems)
        .leftJoin(taxonomyStatuses, eq(taxonomyStatuses.key, expertiseItems.statusKey))
        .orderBy(asc(sql`lower(${expertiseItems.name})`)),
      this.db
        .select({ expertiseId: expertiseTeams.expertiseId, key: teams.key, label: teams.label })
        .from(expertiseTeams)
        .innerJoin(teams, eq(teams.key, expertiseTeams.teamKey))
        .orderBy(asc(teams.sortOrder)),
    ]);

    const status = (row: { statusKey: string | null; statusLabel: string | null }) =>
      row.statusKey ? { key: row.statusKey, label: row.statusLabel ?? row.statusKey } : null;
    const teamsByItem = new Map<string, { key: string; label: string }[]>();
    for (const { expertiseId, key, label } of teamLinks) {
      teamsByItem.set(expertiseId, [...(teamsByItem.get(expertiseId) ?? []), { key, label }]);
    }

    return {
      domains: domains.map((domain) => ({
        id: domain.id,
        name: domain.name,
        stableId: domain.stableId,
        status: status(domain),
        fields: fields
          .filter((field) => field.domainId === domain.id)
          .map((field) => ({
            id: field.id,
            name: field.name,
            stableId: field.stableId,
            status: status(field),
            items: items
              .filter((item) => item.fieldId === field.id)
              .map((item) => ({
                id: item.id,
                name: item.name,
                stableId: item.stableId,
                status: status(item),
                teams: teamsByItem.get(item.id) ?? [],
                peopleCount: item.peopleCount,
                organizationCount: item.organizationCount,
              })),
          })),
      })),
    };
  }

  /**
   * Ranked, paginated search over expertise items. One indexed scan of
   * ~1,100 rows joined to their field and domain; the rank puts exact and
   * prefix name matches first, then Stable ID, then field/domain matches.
   */
  async search(query: ExpertiseSearchQuery): Promise<Page<ExpertiseSearchItemDto>> {
    const q = query.q?.toLowerCase();
    const contains = q ? containsPattern(q) : undefined;
    const name = sql`lower(${expertiseItems.name})`;
    const stable = sql`coalesce(${expertiseItems.stableId}, '')`;
    const where = and(
      query.includeInactive ? undefined : eq(expertiseItems.statusKey, "active"),
      contains
        ? or(
            ilike(expertiseItems.name, contains),
            ilike(expertiseItems.stableId, contains),
            ilike(expertiseFields.name, contains),
            ilike(expertiseDomains.name, contains),
          )
        : undefined,
    );
    const rank = q
      ? sql<number>`case
          when ${name} = ${q} then 0
          when lower(${stable}) = ${q} then 1
          when ${name} like ${`${escapeLike(q)}%`} then 2
          when ${name} like ${`% ${escapeLike(q)}%`} then 3
          when ${name} like ${contains} then 4
          when lower(${stable}) like ${contains} then 5
          when lower(${expertiseFields.name}) like ${contains} then 6
          else 7 end`
      : undefined; // no ranking without a query (a bare "order by 0" is a column position in PostgreSQL)

    const base = this.db
      .select({
        id: expertiseItems.id,
        name: expertiseItems.name,
        stableId: expertiseItems.stableId,
        statusKey: expertiseItems.statusKey,
        statusLabel: taxonomyStatuses.label,
        fieldId: expertiseFields.id,
        fieldName: expertiseFields.name,
        domainId: expertiseDomains.id,
        domainName: expertiseDomains.name,
      })
      .from(expertiseItems)
      .innerJoin(expertiseFields, eq(expertiseFields.id, expertiseItems.fieldId))
      .innerJoin(expertiseDomains, eq(expertiseDomains.id, expertiseFields.domainId))
      .leftJoin(taxonomyStatuses, eq(taxonomyStatuses.key, expertiseItems.statusKey));
    const [rows, [count]] = await Promise.all([
      base
        .where(where)
        .orderBy(...(rank ? [asc(rank)] : []), asc(name), asc(sql`lower(${expertiseFields.name})`), asc(expertiseItems.id))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize),
      this.db
        .select({ total: sql<number>`count(*)::int` })
        .from(expertiseItems)
        .innerJoin(expertiseFields, eq(expertiseFields.id, expertiseItems.fieldId))
        .innerJoin(expertiseDomains, eq(expertiseDomains.id, expertiseFields.domainId))
        .where(where),
    ]);

    const teamRows = rows.length
      ? await this.db
          .select({ expertiseId: expertiseTeams.expertiseId, key: teams.key, label: teams.label })
          .from(expertiseTeams)
          .innerJoin(teams, eq(teams.key, expertiseTeams.teamKey))
          .where(inArray(expertiseTeams.expertiseId, rows.map((row) => row.id)))
          .orderBy(asc(teams.sortOrder))
      : [];
    return {
      items: rows.map((row) => ({
        id: row.id,
        name: row.name,
        stableId: row.stableId,
        status: row.statusKey ? { key: row.statusKey, label: row.statusLabel ?? row.statusKey } : null,
        field: { id: row.fieldId, name: row.fieldName },
        domain: { id: row.domainId, name: row.domainName },
        path: `${row.domainName} > ${row.fieldName} > ${row.name}`,
        teams: teamRows.filter((team) => team.expertiseId === row.id).map(({ key, label }) => ({ key, label })),
        selectable: row.statusKey === "active",
      })),
      page: query.page,
      pageSize: query.pageSize,
      total: count?.total ?? 0,
    };
  }

  async exists(level: ExpertiseLevel, id: string): Promise<boolean> {
    const table = TABLE[level];
    const [row] = await this.db.select({ id: table.id }).from(table).where(eq(table.id, id)).limit(1);
    return row !== undefined;
  }

  async createDomain(name: string) {
    const [row] = await this.db.insert(expertiseDomains).values({ name }).returning({ id: expertiseDomains.id, name: expertiseDomains.name });
    return row!;
  }

  async createField(domainId: string, name: string) {
    const [row] = await this.db
      .insert(expertiseFields)
      .values({ domainId, name })
      .returning({ id: expertiseFields.id, name: expertiseFields.name, domainId: expertiseFields.domainId });
    return row!;
  }

  async createExpertise(fieldId: string, name: string) {
    const [row] = await this.db
      .insert(expertiseItems)
      .values({ fieldId, name })
      .returning({ id: expertiseItems.id, name: expertiseItems.name, fieldId: expertiseItems.fieldId });
    return row!;
  }

  async rename(level: ExpertiseLevel, id: string, name: string) {
    const table = TABLE[level];
    const [row] = await this.db
      .update(table)
      .set({ name, updatedAt: new Date() })
      .where(eq(table.id, id))
      .returning({ id: table.id, name: table.name });
    return row;
  }

  /** Number of direct dependants that block deletion (children, or people/organization tags). */
  async dependants(level: ExpertiseLevel, id: string): Promise<number> {
    if (level === "domain") {
      const [row] = await this.db.select({ n: sql<number>`count(*)::int` }).from(expertiseFields).where(eq(expertiseFields.domainId, id));
      return row?.n ?? 0;
    }
    if (level === "field") {
      const [row] = await this.db.select({ n: sql<number>`count(*)::int` }).from(expertiseItems).where(eq(expertiseItems.fieldId, id));
      return row?.n ?? 0;
    }
    const [[byPeople], [byOrganizations]] = await Promise.all([
      this.db.select({ n: sql<number>`count(*)::int` }).from(peopleExpertise).where(eq(peopleExpertise.expertiseId, id)),
      this.db
        .select({ n: sql<number>`count(*)::int` })
        .from(organizationExpertise)
        .where(eq(organizationExpertise.expertiseId, id)),
    ]);
    return (byPeople?.n ?? 0) + (byOrganizations?.n ?? 0);
  }

  async delete(level: ExpertiseLevel, id: string): Promise<boolean> {
    const table = TABLE[level];
    const removed = await this.db.delete(table).where(eq(table.id, id)).returning({ id: table.id });
    return removed.length > 0;
  }
}
