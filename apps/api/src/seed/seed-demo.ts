import { like, sql } from "drizzle-orm";
import type { Database } from "../common/database/database.module.js";
import { expertiseDomains, expertiseFields, expertiseItems } from "../expertise/expertise.schema.js";
import { organizationExpertise, organizations } from "../organizations/organizations.schema.js";
import { people, peopleExpertise, peopleOrganizations } from "../people/people.schema.js";
import { DEMO_ID_PREFIX, DEMO_ORGANIZATIONS, DEMO_PEOPLE, DEMO_TAXONOMY } from "./demo-data.js";

const isDemo = (column: Parameters<typeof like>[0]) => like(sql`${column}::text`, `${DEMO_ID_PREFIX}%`);

/** Removes every demo row (and only demo rows — matched by the reserved id range). */
export async function removeDemoData(db: Database): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(people).where(isDemo(people.id));
    await tx.delete(organizations).where(isDemo(organizations.id));
    await tx.delete(expertiseItems).where(isDemo(expertiseItems.id));
    await tx.delete(expertiseFields).where(isDemo(expertiseFields.id));
    await tx.delete(expertiseDomains).where(isDemo(expertiseDomains.id));
  });
}

/**
 * Idempotent: re-running restores the demo rows to their defined state
 * (links included) without touching any non-demo record.
 */
export async function seedDemoData(db: Database): Promise<{ people: number; organizations: number; expertise: number }> {
  await removeDemoData(db);
  await db.transaction(async (tx) => {
    for (const domain of DEMO_TAXONOMY.domains) {
      await tx.insert(expertiseDomains).values({ id: domain.id, name: domain.name });
      for (const field of domain.fields) {
        await tx.insert(expertiseFields).values({ id: field.id, domainId: domain.id, name: field.name });
        if (field.items.length > 0) {
          await tx.insert(expertiseItems).values(field.items.map((item) => ({ id: item.id, fieldId: field.id, name: item.name })));
        }
      }
    }

    await tx.insert(organizations).values(
      DEMO_ORGANIZATIONS.map(({ id, name, website, note }) => ({ id, name, website, note })),
    );
    const organizationTags = DEMO_ORGANIZATIONS.flatMap((organization) =>
      organization.expertiseIds.map((expertiseId) => ({ organizationId: organization.id, expertiseId })),
    );
    if (organizationTags.length > 0) await tx.insert(organizationExpertise).values(organizationTags);

    await tx.insert(people).values(
      DEMO_PEOPLE.map((person) => ({
        id: person.id,
        name: person.name,
        stateKey: person.stateKey,
        sourceKey: person.sourceKey,
        personalNote: person.personalNote,
        doNotContact: person.doNotContact,
        email: person.email,
        phone: person.phone,
        website: person.website,
        linkedin: person.linkedin,
        x: person.x,
        otherContact: person.otherContact,
        lastFollowupAt: person.lastFollowupAt,
        createdAt: person.createdAt,
        updatedAt: person.createdAt,
      })),
    );
    const memberships = DEMO_PEOPLE.flatMap((person) =>
      person.organizationIds.map((organizationId) => ({ personId: person.id, organizationId })),
    );
    if (memberships.length > 0) await tx.insert(peopleOrganizations).values(memberships);
    const personTags = DEMO_PEOPLE.flatMap((person) => person.expertiseIds.map((expertiseId) => ({ personId: person.id, expertiseId })));
    if (personTags.length > 0) await tx.insert(peopleExpertise).values(personTags);
  });

  return {
    people: DEMO_PEOPLE.length,
    organizations: DEMO_ORGANIZATIONS.length,
    expertise: DEMO_TAXONOMY.domains.flatMap((d) => d.fields.flatMap((f) => f.items)).length,
  };
}

/**
 * Where demo data may go: never production, and only a database whose name
 * says it's for development or tests. Returns the reason when refused.
 */
export function demoSeedRefusal(env: NodeJS.ProcessEnv, databaseUrl: string): string | undefined {
  if (env.NODE_ENV === "production") return "NODE_ENV is production.";
  let name: string;
  try {
    name = decodeURIComponent(new URL(databaseUrl).pathname.replace(/^\//, ""));
  } catch {
    return "DATABASE_URL is not a valid URL.";
  }
  if (!/_(dev|test)$/.test(name)) return `database "${name}" doesn't end in _dev or _test.`;
  return undefined;
}
