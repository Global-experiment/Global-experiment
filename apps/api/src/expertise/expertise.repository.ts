import { Inject, Injectable } from "@nestjs/common";
import { asc, eq, sql } from "drizzle-orm";
import { DATABASE, type Database } from "../common/database/database.module.js";
import { organizationExpertise } from "../organizations/organizations.schema.js";
import { peopleExpertise } from "../people/people.schema.js";
import type { ExpertiseLevel, ExpertiseTreeDto } from "./expertise.contracts.js";
import { expertiseDomains, expertiseFields, expertiseItems } from "./expertise.schema.js";

const TABLE = { domain: expertiseDomains, field: expertiseFields, expertise: expertiseItems } as const;

@Injectable()
export class ExpertiseRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** The whole taxonomy in three ordered queries, with how often each expertise is used. */
  async tree(): Promise<ExpertiseTreeDto> {
    const [domains, fields, items] = await Promise.all([
      this.db
        .select({ id: expertiseDomains.id, name: expertiseDomains.name })
        .from(expertiseDomains)
        .orderBy(asc(sql`lower(${expertiseDomains.name})`)),
      this.db
        .select({ id: expertiseFields.id, name: expertiseFields.name, domainId: expertiseFields.domainId })
        .from(expertiseFields)
        .orderBy(asc(sql`lower(${expertiseFields.name})`)),
      this.db
        .select({
          id: expertiseItems.id,
          name: expertiseItems.name,
          fieldId: expertiseItems.fieldId,
          peopleCount: sql<number>`(select count(*)::int from ${peopleExpertise} where ${peopleExpertise.expertiseId} = ${expertiseItems.id})`,
          organizationCount: sql<number>`(select count(*)::int from ${organizationExpertise} where ${organizationExpertise.expertiseId} = ${expertiseItems.id})`,
        })
        .from(expertiseItems)
        .orderBy(asc(sql`lower(${expertiseItems.name})`)),
    ]);

    return {
      domains: domains.map((domain) => ({
        ...domain,
        fields: fields
          .filter((field) => field.domainId === domain.id)
          .map((field) => ({
            id: field.id,
            name: field.name,
            items: items
              .filter((item) => item.fieldId === field.id)
              .map(({ id, name, peopleCount, organizationCount }) => ({ id, name, peopleCount, organizationCount })),
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
