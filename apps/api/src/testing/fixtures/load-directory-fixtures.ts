import type { Database } from "../../common/database/database.module.js";
import { expertiseDomains, expertiseFields, expertiseItems, expertiseTeams } from "../../expertise/expertise.schema.js";
import { organizationExpertise, organizations } from "../../organizations/organizations.schema.js";
import { people, peopleExpertise, peopleOrganizations } from "../../people/people.schema.js";
import { FIXTURE_ORGANIZATIONS, FIXTURE_PEOPLE, FIXTURE_TAXONOMY } from "./directory-fixtures.js";

/**
 * Writes the test fixtures into a freshly migrated `*_test` database (the
 * caller — e2e-setup.ts — wipes it and checks the name first). Test-only:
 * this folder never ships in the API build.
 */
export async function loadDirectoryFixtures(db: Database): Promise<void> {
  const today = new Date();
  const dayFromToday = (days: number) => new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate() + days)).toISOString().slice(0, 10);
  await db.transaction(async (tx) => {
    for (const domain of FIXTURE_TAXONOMY.domains) {
      await tx.insert(expertiseDomains).values({ id: domain.id, name: domain.name, stableId: domain.stableId, statusKey: "active" });
      for (const field of domain.fields) {
        await tx.insert(expertiseFields).values({ id: field.id, domainId: domain.id, name: field.name, stableId: field.stableId, statusKey: "active" });
        if (field.items.length > 0) {
          await tx
            .insert(expertiseItems)
            .values(field.items.map((item) => ({ id: item.id, fieldId: field.id, name: item.name, stableId: item.stableId, statusKey: item.statusKey })));
          const teamLinks = field.items.flatMap((item) => item.teams.map((teamKey) => ({ expertiseId: item.id, teamKey })));
          if (teamLinks.length > 0) await tx.insert(expertiseTeams).values(teamLinks);
        }
      }
    }

    await tx.insert(organizations).values(
      FIXTURE_ORGANIZATIONS.map(({ id, name, description, website, email }) => ({ id, name, description, website, email })),
    );
    const organizationTags = FIXTURE_ORGANIZATIONS.flatMap((organization) =>
      organization.expertiseIds.map((expertiseId) => ({ organizationId: organization.id, expertiseId })),
    );
    if (organizationTags.length > 0) await tx.insert(organizationExpertise).values(organizationTags);

    await tx.insert(people).values(
      FIXTURE_PEOPLE.map((person) => ({
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
        nextFollowupOn: person.followUpInDays === null ? null : dayFromToday(person.followUpInDays),
        createdAt: person.createdAt,
        updatedAt: person.createdAt,
      })),
    );
    const memberships = FIXTURE_PEOPLE.flatMap((person) =>
      person.organizationIds.map((organizationId) => ({ personId: person.id, organizationId })),
    );
    if (memberships.length > 0) await tx.insert(peopleOrganizations).values(memberships);
    const personTags = FIXTURE_PEOPLE.flatMap((person) => person.expertiseIds.map((expertiseId) => ({ personId: person.id, expertiseId })));
    if (personTags.length > 0) await tx.insert(peopleExpertise).values(personTags);
  });
}
