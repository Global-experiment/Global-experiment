import { Inject, Injectable } from "@nestjs/common";
import { asc, eq, sql } from "drizzle-orm";
import { DATABASE, type Database } from "../common/database/database.module.js";
import { organizationExpertise } from "../organizations/organizations.schema.js";
import { peopleExpertise } from "../people/people.schema.js";
import type { ExpertiseLevel, ExpertiseTreeDto } from "./expertise.contracts.js";
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
