import { describe, expect, it } from "vitest";
import { countDirectoryPlan, onlyDemoRefusal, planDirectoryImport, type DbOrganization, type DbPerson, type DirectorySnapshot } from "./directory-plan.js";
import type { DirectorySource, SourceOrganization, SourcePerson } from "./directory-source.js";

// Test fixtures only (never written to a non-test database).
let clock = 0;
const at = () => `2026-10-14T08:00:${String(clock++ % 60).padStart(2, "0")}.000Z`;
const org = (pageId: string, name: string, extra: Partial<SourceOrganization> = {}): SourceOrganization => ({
  kind: "organization",
  pageId,
  createdTime: at(),
  name,
  number: null,
  description: "A real organization.",
  website: `https://${pageId}.ch`,
  email: `team@${pageId}.ch`,
  wiseRecipientId: null,
  peoplePageIds: [],
  expertisePageIds: [],
  expensesCount: 0,
  missingRequired: [],
  ...extra,
});
const person = (pageId: string, name: string, extra: Partial<SourcePerson> = {}): SourcePerson => ({
  kind: "person",
  pageId,
  createdTime: at(),
  name,
  number: null,
  state: "Sourced",
  source: "Candide",
  description: "Met at a civic tech meetup.",
  doNotContact: false,
  email: `${pageId}@ngo.ch`,
  phone: null,
  website: null,
  linkedin: null,
  x: null,
  otherContact: null,
  wiseRecipientId: null,
  nextFollowupAt: null,
  organizationPageIds: [],
  expertisePageIds: [],
  expensesCount: 0,
  accessGrantsCount: 0,
  missingRequired: [],
  ...extra,
});
const layout = (expertise: boolean) => ({ names: {}, required: [], unread: [], absent: expertise ? [] : ["Expertise"] });
const source = (organizations: SourceOrganization[], people: SourcePerson[], expertise = true): DirectorySource => ({
  organizations,
  people,
  layouts: { people: layout(expertise), organizations: layout(expertise) },
});
const snapshot = (parts: Partial<DirectorySnapshot> = {}): DirectorySnapshot => ({
  organizations: [],
  people: [],
  personOrganization: [],
  personExpertise: [],
  organizationExpertise: [],
  expertiseByPage: new Map([
    ["exp-page-1", "EXP1"],
    ["exp-page-2", "EXP2"],
  ]),
  states: [
    { key: "sourced", label: "Sourced" },
    { key: "in_discussion", label: "In discussion" },
  ],
  sources: [
    { key: "candide", label: "Candide" },
    { key: "ai", label: "AI" },
    { key: "contribution_email", label: "Contribution email" },
    { key: "other", label: "Other" },
  ],
  ...parts,
});
const dbPerson = (id: string, extra: Partial<DbPerson> = {}): DbPerson => ({
  id,
  notionPageId: null,
  personNumber: 1,
  name: id,
  stateKey: null,
  sourceKey: null,
  description: null,
  doNotContact: false,
  email: null,
  phone: null,
  website: null,
  linkedin: null,
  x: null,
  otherContact: null,
  wiseRecipientId: null,
  nextFollowupAt: null,
  ...extra,
});
const dbOrg = (id: string, extra: Partial<DbOrganization> = {}): DbOrganization => ({
  id,
  notionPageId: null,
  orgNumber: 1,
  name: id,
  description: null,
  website: null,
  email: null,
  wiseRecipientId: null,
  ...extra,
});
const issues = (plan: ReturnType<typeof planDirectoryImport>) => plan.issues.map((issue) => `${issue.kind}:${issue.code}:${issue.name}`);

describe("directory import plan", () => {
  it("skips demo records (example.org, Fictional sample, DEMO-) and lists them", () => {
    const plan = planDirectoryImport(
      source(
        [org("o-demo", "Horizon Open Tools", { wiseRecipientId: "DEMO-RECIPIENT-ORG-20", email: "org20@example.org" }), org("o-real", "Civic Lab")],
        [
          person("p-demo", "Sofia Duarte", { email: "person3@example.org", website: "https://example.org/person-3" }),
          person("p-story", "Story Person", { description: "Fictional sample — do not contact" }),
          person("p-real", "Amina Diallo"),
        ],
      ),
      snapshot(),
    );
    expect(plan.issues.filter((i) => i.code === "demo_record").map((i) => [i.name, i.detail])).toEqual([
      ["Horizon Open Tools", "Demo record (example.org email, DEMO- value): not imported."],
      ["Sofia Duarte", "Demo record (example.org email, example.org website): not imported."],
      ["Story Person", 'Demo record ("Fictional sample" text): not imported.'],
    ]);
    expect(plan.organizations.map((r) => r.pageId)).toEqual(["o-real"]);
    expect(plan.people.map((r) => r.pageId)).toEqual(["p-real"]);
    expect(onlyDemoRefusal(plan)).toBeUndefined();
  });

  it("refuses --apply when every record is demo", () => {
    const plan = planDirectoryImport(source([org("o", "Demo Org", { email: "x@example.org" })], [person("p", "Demo", { email: "p@example.org" })]), snapshot());
    expect(onlyDemoRefusal(plan)).toBe(
      'Refusing to apply: all 2 Notion records (1 people, 1 organizations) are demo records (example.org, "Fictional sample", DEMO-). Nothing real to import yet — run --dry-run to review.',
    );
    expect(onlyDemoRefusal(planDirectoryImport(source([], []), snapshot()))).toBeUndefined();
  });

  it("maps State and Source by label; unknown values are left empty and reported", () => {
    const plan = planDirectoryImport(
      source(
        [],
        [
          person("p1", "Ada", { state: "In discussion", source: "Contribution email" }),
          person("p2", "Bo", { state: "Archived", source: "Referral" }),
          person("p3", "Cleo", { source: "Other" }), // migration 0004
        ],
      ),
      snapshot(),
    );
    expect(plan.people.map((r) => [r.values.stateKey, r.values.sourceKey])).toEqual([
      ["in_discussion", "contribution_email"],
      [null, null],
      ["sourced", "other"],
    ]);
    expect(issues(plan)).toEqual(["value_skipped:unknown_state:Bo", "value_skipped:unknown_source:Bo"]);
  });

  it("sets Notion's PER/ORG numbers; one another row holds is flagged and left unset", () => {
    const plan = planDirectoryImport(
      source([org("o1", "Civic Lab", { number: 3 })], [person("p1", "Ada", { number: 12 }), person("p2", "Bo", { number: 5 }), person("p3", "Cleo", { number: 7 })]),
      snapshot({
        people: [
          dbPerson("ADMIN", { personNumber: 5, name: "Admin-made person" }), // holds PER-5, not from Notion
          dbPerson("CLEO", { notionPageId: "p3", personNumber: 9, name: "Cleo", stateKey: "sourced", sourceKey: "candide", description: "Met at a civic tech meetup.", email: "p3@ngo.ch" }),
        ],
      }),
    );
    expect(plan.people.map((r) => [r.pageId, r.action, r.number])).toEqual([
      ["p1", "create", 12],
      ["p2", "create", null], // PER-5 is taken: the database assigns the next free number
      ["p3", "update", 7], // an existing record moves to its Notion number
    ]);
    expect(plan.people[2]!.changes).toEqual(["number"]);
    expect(plan.organizations[0]!.number).toBe(3);
    expect(plan.issues.map((i) => [i.code, i.name, i.detail])).toEqual([
      ["number_taken", "Bo", "PER-5 already belongs to another record; gets the next free number."],
    ]);
  });

  it("an existing record whose Notion number is taken keeps its own number", () => {
    const plan = planDirectoryImport(
      source([], [person("p1", "Ada", { number: 5 })]),
      snapshot({ people: [dbPerson("ADMIN", { personNumber: 5 }), dbPerson("ADA", { notionPageId: "p1", personNumber: 8, name: "Ada" })] }),
    );
    expect(plan.people[0]).toMatchObject({ action: "update", number: null });
    expect(plan.people[0]!.changes).not.toContain("number");
    expect(plan.issues[0]!.detail).toBe("PER-5 already belongs to another record; keeps PER-8.");
  });

  it("leaves invalid or too long values empty and flags them — the record is imported", () => {
    const plan = planDirectoryImport(
      source([org("o1", "Civic Lab", { email: "not-an-email", wiseRecipientId: "9".repeat(101) })], [person("p1", "Ada", { nextFollowupAt: "next week", phone: "1".repeat(65) })]),
      snapshot(),
    );
    expect(plan.organizations[0]!.values).toMatchObject({ email: null, wiseRecipientId: null });
    expect(plan.people[0]!.values).toMatchObject({ nextFollowupAt: null, phone: null });
    expect(plan.issues.map((i) => i.detail)).toEqual([
      'Email "not-an-email" isn\'t valid; left empty.',
      "Wise recipient account ID is 101 characters (max 100); left empty.",
      "Phone is 65 characters (max 64); left empty.",
      'Follow-up date "next week" isn\'t valid; left empty.',
    ]);
    expect(countDirectoryPlan(plan)).toMatchObject({ organization: { created: 1, flagged: 1 }, person: { created: 1, flagged: 1 } });
  });

  it("imports possible duplicates (same name or email, in Notion or in the database) and flags them — never merges", () => {
    const plan = planDirectoryImport(
      source([], [person("p1", "Ada Lovelace", { email: "ada@ngo.ch" }), person("p2", "ada lovelace ", { email: "other@ngo.ch" }), person("p3", "Bo", { email: "ADA@ngo.ch" })]),
      snapshot({ people: [dbPerson("ADMIN", { name: "Cleo", email: "bo@elsewhere.ch" })] }),
    );
    expect(plan.people.map((r) => r.action)).toEqual(["create", "create", "create"]);
    expect(plan.issues.map((i) => [i.name, i.detail])).toEqual([
      ["Ada Lovelace", "Possible duplicate (same name as 1 other person; same email as Bo): imported separately, never merged."],
      ["ada lovelace", "Possible duplicate (same name as 1 other person): imported separately, never merged."],
      ["Bo", "Possible duplicate (same email as Ada Lovelace): imported separately, never merged."],
    ]);
  });

  it("flags records whose starred properties are empty (still imported)", () => {
    const plan = planDirectoryImport(source([org("o1", "Civic Lab", { missingRequired: ["Description", "Wise recipient account ID"] })], []), snapshot());
    expect(plan.issues.map((i) => [i.kind, i.code, i.detail])).toEqual([
      ["flagged", "incomplete", "Required for completeness but empty: Description, Wise recipient account ID."],
    ]);
    expect(plan.organizations).toHaveLength(1);
  });

  it("links people and organizations from either side; links to skipped records are reported", () => {
    const plan = planDirectoryImport(
      source(
        [org("o1", "Civic Lab", { peoplePageIds: ["p2"] }), org("o-demo", "Demo Org", { email: "a@example.org" })],
        [person("p1", "Ada", { organizationPageIds: ["o1", "o-demo", "nowhere"] }), person("p2", "Bo")],
      ),
      snapshot(),
    );
    expect(plan.personOrganization.add).toEqual([
      { person: { pageId: "p1" }, organization: { pageId: "o1" } },
      { person: { pageId: "p2" }, organization: { pageId: "o1" } },
    ]);
    expect(plan.issues.filter((i) => i.kind === "link_skipped").map((i) => i.detail)).toEqual([
      'Link to organization "Demo Org" skipped: that organization isn\'t imported.',
      'Link to organization "nowhere" skipped: not an organization in the Organizations database.',
    ]);
  });

  it("removes links Notion no longer has between imported records, but never touches manual links", () => {
    const realPerson = dbPerson("ADA", { notionPageId: "p1", name: "Ada", stateKey: "sourced", sourceKey: "candide", description: "Met at a civic tech meetup.", email: "p1@ngo.ch" });
    const plan = planDirectoryImport(
      source([org("o1", "Civic Lab"), org("o2", "Water Trust")], [person("p1", "Ada", { organizationPageIds: ["o2"], expertisePageIds: ["exp-page-2"] })]),
      snapshot({
        people: [realPerson, dbPerson("MANUAL-P", { name: "Admin person" })],
        organizations: [
          dbOrg("O1", { notionPageId: "o1", name: "Civic Lab", description: "A real organization.", website: "https://o1.ch", email: "team@o1.ch" }),
          dbOrg("O2", { notionPageId: "o2", name: "Water Trust", description: "A real organization.", website: "https://o2.ch", email: "team@o2.ch" }),
          dbOrg("MANUAL-O", { name: "Admin org" }),
        ],
        personOrganization: [
          { personId: "ADA", organizationId: "O1" }, // removed in Notion → removed
          { personId: "ADA", organizationId: "MANUAL-O" }, // to an admin-made org → kept
          { personId: "MANUAL-P", organizationId: "O1" }, // an admin-made person → kept
        ],
        personExpertise: [
          { personId: "ADA", expertiseId: "EXP1" }, // Notion taxonomy item no longer listed → removed
          { personId: "ADA", expertiseId: "ADMIN-EXP" }, // admin-made expertise → kept
        ],
      }),
    );
    expect(plan.personOrganization.add).toEqual([{ person: { dbId: "ADA" }, organization: { dbId: "O2" } }]);
    expect(plan.personOrganization.remove).toEqual([{ personId: "ADA", organizationId: "O1" }]);
    expect(plan.personExpertise).toMatchObject({ add: [{ owner: { dbId: "ADA" }, expertiseId: "EXP2" }], remove: [{ ownerId: "ADA", expertiseId: "EXP1" }] });
    expect(plan.people[0]!.action).toBe("unchanged"); // links don't count as field changes
  });

  it("skips expertise links outside the imported taxonomy, and leaves expertise alone when Notion has no Expertise property", () => {
    const withProperty = planDirectoryImport(source([], [person("p1", "Ada", { expertisePageIds: ["exp-page-1", "community-page"] })]), snapshot());
    expect(withProperty.personExpertise.add).toEqual([{ owner: { pageId: "p1" }, expertiseId: "EXP1" }]);
    expect(withProperty.issues.map((i) => [i.code, i.detail])).toEqual([
      ["unresolved_expertise", "Expertise link to Notion page community-page skipped: it isn't an imported Expertise item (the taxonomy holds only Expertise-level items)."],
    ]);

    const withoutProperty = planDirectoryImport(
      source([], [person("p1", "Ada", { expertisePageIds: null })], false),
      snapshot({ people: [dbPerson("ADA", { notionPageId: "p1" })], personExpertise: [{ personId: "ADA", expertiseId: "EXP1" }] }),
    );
    expect(withoutProperty.personExpertise).toEqual({ add: [], remove: [], synced: false });
  });

  it("reports records Notion no longer has, and counts the ignored Expenses / Access grants links", () => {
    const plan = planDirectoryImport(
      source([org("o1", "Civic Lab", { expensesCount: 2 })], [person("p1", "Ada", { expensesCount: 1, accessGrantsCount: 3 })]),
      snapshot({ people: [dbPerson("GONE", { notionPageId: "p-gone", personNumber: 4, name: "Gone" })] }),
    );
    expect(plan.issues.map((i) => [i.kind, i.detail])).toEqual([["missing", "PER-4 is no longer in Notion; left as it is."]]);
    expect(plan.ignored).toMatchObject({ expensesLinks: 3, accessGrantLinks: 3 });
  });
});

describe("directory import plan: relationship limits", () => {
  const pages = (prefix: string, count: number) => Array.from({ length: count }, (_, index) => `${prefix}-${index + 1}`);
  const expertiseSnapshot = (count: number, parts: Partial<DirectorySnapshot> = {}) =>
    snapshot({
      expertiseByPage: new Map(pages("exp-page", count).map((page, index) => [page, `EXP${index + 1}`])),
      expertiseNames: new Map(pages("exp-page", count).map((_, index) => [`EXP${index + 1}`, `Skill ${index + 1}`])),
      ...parts,
    });

  it("imports a person's first 10 expertise in Notion order, flags the person and lists the ones left out", () => {
    const plan = planDirectoryImport(source([], [person("p1", "Ada Lovelace", { expertisePageIds: pages("exp-page", 12) })]), expertiseSnapshot(12));

    expect(plan.personExpertise.add.map((link) => link.expertiseId)).toEqual(pages("EXP", 10).map((_, index) => `EXP${index + 1}`));
    expect(plan.issues.filter((i) => i.code === "over_limit").map((i) => [i.kind, i.detail])).toEqual([
      ["flagged", "Has 12 expertise (max 10): the first 10 from Notion imported, 2 left out (listed under Links skipped)."],
      ["link_skipped", 'Expertise link to "Skill 11" left out: over the limit of 10 expertise per person.'],
      ["link_skipped", 'Expertise link to "Skill 12" left out: over the limit of 10 expertise per person.'],
    ]);
    expect(countDirectoryPlan(plan).person.flagged).toBe(1);
  });

  it("caps an organization's expertise at 10 as well", () => {
    const plan = planDirectoryImport(source([org("o1", "Civic Lab", { expertisePageIds: pages("exp-page", 11) })], []), expertiseSnapshot(11));
    expect(plan.organizationExpertise.add).toHaveLength(10);
    expect(issues(plan).filter((i) => i.includes("over_limit"))).toEqual([
      "flagged:over_limit:Civic Lab",
      "link_skipped:over_limit:Civic Lab",
    ]);
  });

  it("keeps a person's first 5 organizations: the person's own list first, then links from the organizations' side", () => {
    const organizations = pages("o", 7).map((page, index) => org(page, `Org ${index + 1}`));
    // The person lists o-1…o-4; o-5, o-6 and o-7 list the person from their side.
    organizations[4] = { ...organizations[4]!, peoplePageIds: ["p1"] };
    organizations[5] = { ...organizations[5]!, peoplePageIds: ["p1"] };
    organizations[6] = { ...organizations[6]!, peoplePageIds: ["p1"] };
    const plan = planDirectoryImport(source(organizations, [person("p1", "Ada Lovelace", { organizationPageIds: pages("o", 4) })]), snapshot());

    expect(plan.personOrganization.add.map((link) => ("pageId" in link.organization ? link.organization.pageId : ""))).toEqual(["o-1", "o-2", "o-3", "o-4", "o-5"]);
    expect(plan.issues.filter((i) => i.code === "over_limit").map((i) => i.detail)).toEqual([
      "Has 7 organizations (max 5): the first 5 from Notion imported, 2 left out (listed under Links skipped).",
      'Link to organization "Org 6" left out: over the limit of 5 organizations per person.',
      'Link to organization "Org 7" left out: over the limit of 5 organizations per person.',
    ]);
  });

  it("counts links the import leaves alone (to admin-made records) first, and removes imported links over the cap", () => {
    // P1 (imported earlier) has 2 links to admin-made organizations and 1 imported link that Notion now lists 4th.
    const db = { people: [dbPerson("P1", { notionPageId: "p1", name: "Ada Lovelace" })], organizations: [dbOrg("A1"), dbOrg("A2"), ...pages("o", 4).map((page, index) => dbOrg(`O${index + 1}`, { notionPageId: page, name: `Org ${index + 1}` }))] };
    const plan = planDirectoryImport(
      source(
        pages("o", 4).map((page, index) => org(page, `Org ${index + 1}`)),
        [person("p1", "Ada Lovelace", { organizationPageIds: pages("o", 4) })],
      ),
      snapshot({
        ...db,
        personOrganization: [
          { personId: "P1", organizationId: "A1" },
          { personId: "P1", organizationId: "A2" },
          { personId: "P1", organizationId: "O4" },
        ],
      }),
    );
    // 2 kept + 3 from Notion = 5. O4 is over the cap: not kept.
    expect(plan.personOrganization.add.map((link) => ("dbId" in link.organization ? link.organization.dbId : ""))).toEqual(["O1", "O2", "O3"]);
    expect(plan.personOrganization.remove).toEqual([{ personId: "P1", organizationId: "O4" }]);
    expect(plan.issues.find((i) => i.kind === "flagged" && i.code === "over_limit")?.detail).toBe(
      "Has 6 organizations (max 5): 2 existing kept, the first 3 from Notion imported, 1 left out (listed under Links skipped).",
    );
  });

  it("leaves records within the limits unflagged", () => {
    const plan = planDirectoryImport(source([], [person("p1", "Ada Lovelace", { expertisePageIds: pages("exp-page", 10) })]), expertiseSnapshot(10));
    expect(plan.personExpertise.add).toHaveLength(10);
    expect(plan.issues.filter((i) => i.code === "over_limit")).toEqual([]);
  });
});
