/**
 * TEST FIXTURES — synthetic records for the admin Playwright suite only.
 *
 * Project rule (docs/architecture/data-model.md §5, "No demo data,
 * anywhere"): fixtures exist only for automated tests and are only ever
 * written to a `*_test` database (by e2e-setup.ts, which refuses any other
 * database). This folder is excluded from the API build
 * (tsconfig.build.json), so no deployed command can load it.
 *
 * Names are invented combinations, emails/websites use the reserved
 * `example.org` domain, and every id lives in the reserved `de000000-…`
 * range — the same markers the purge command recognises.
 */

const KIND = { a: 1, b: 2, c: 3, d: 4, e: 5 } as const;

/** Valid RFC 4122 v4 UUIDs (strict validators accept them): de000000-<kind>000-4000-8000-<n>. */
const id = (kind: keyof typeof KIND, n: number) =>
  `de000000-${KIND[kind]}000-4000-8000-${n.toString(16).padStart(12, "0")}`;

export interface FixtureItem {
  id: string;
  name: string;
  stableId: string;
  statusKey: "active" | "deprecated";
  teams: string[];
}

export interface FixtureTaxonomy {
  domains: { id: string; name: string; stableId: string; fields: { id: string; name: string; stableId: string; items: FixtureItem[] }[] }[];
}

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
const two = (n: number) => String(n).padStart(2, "0");
const TEAM_CYCLE = [["tech"], ["communication", "moderation"], [], ["treasury"], ["compliance"], ["operations", "tech"]];
/** One deprecated item, to exercise "greyed out, not selectable". */
const DEPRECATED = new Set(["Copywriting"]);

const taxonomySource: [string, [string, string[]][]][] = [
  [
    "Technology",
    [
      ["Software engineering", ["Full-stack development", "Web development", "Frontend development", "Backend development", "Mobile development"]],
      ["Data and AI", ["Data engineering", "Machine learning", "Data visualisation"]],
      ["Infrastructure", ["DevOps", "Security engineering"]],
    ],
  ],
  [
    "Design",
    [
      ["Product design", ["UX research", "Interaction design", "Visual design"]],
      ["Communication", ["Copywriting", "Illustration"]],
    ],
  ],
  [
    "Governance",
    [
      ["Civic participation", ["Participatory budgeting", "Deliberative democracy", "Community organising"]],
      ["Policy", ["Public policy", "Digital rights"]],
    ],
  ],
  [
    "Operations",
    [
      ["Finance", ["Nonprofit accounting", "Fundraising"]],
      ["Legal", ["Association law", "Data protection"]],
    ],
  ],
];

let domainN = 0;
let fieldN = 0;
let itemN = 0;
export const FIXTURE_TAXONOMY: FixtureTaxonomy = {
  domains: taxonomySource.map(([domainName, fields], domainIndex) => ({
    id: id("c", ++domainN),
    name: domainName,
    stableId: `domain.${two(domainIndex + 1)}.${slug(domainName)}`,
    fields: fields.map(([fieldName, items], fieldIndex) => ({
      id: id("d", ++fieldN),
      name: fieldName,
      stableId: `field.${two(domainIndex + 1)}.${two(fieldIndex + 1)}.${slug(fieldName)}`,
      items: items.map((itemName) => ({
        id: id("e", ++itemN),
        name: itemName,
        stableId: `${two(domainIndex + 1)}.${two(fieldIndex + 1)}.${slug(itemName)}`,
        statusKey: DEPRECATED.has(itemName) ? ("deprecated" as const) : ("active" as const),
        teams: TEAM_CYCLE[itemN % TEAM_CYCLE.length]!,
      })),
    })),
  })),
};

const allItems = FIXTURE_TAXONOMY.domains.flatMap((domain) => domain.fields.flatMap((field) => field.items));
const itemByName = new Map(allItems.map((item) => [item.name, item.id]));
const expertise = (...names: string[]) => names.map((name) => itemByName.get(name)!);

export interface FixtureOrganization {
  id: string;
  name: string;
  description: string | null;
  website: string | null;
  email: string | null;
  expertiseIds: string[];
}

export const FIXTURE_ORGANIZATIONS: FixtureOrganization[] = [
  ["Northwind Civic Lab", "Research lab prototyping participation tools.", ["Participatory budgeting", "UX research"]],
  ["Open Commons Cooperative", "Worker cooperative maintaining open-source civic software.", ["Full-stack development", "DevOps"]],
  ["Meridian Data Studio", "Small studio for public-interest data projects.", ["Data engineering", "Data visualisation"]],
  ["Harbor Legal Collective", "Pro-bono association law clinic.", ["Association law", "Data protection"]],
  ["Lumen Design Works", null, ["Visual design", "Interaction design"]],
  ["Civic Futures Network", "Network of local democracy initiatives.", ["Deliberative democracy", "Community organising"]],
  ["Atlas Infrastructure Group", null, ["Security engineering", "DevOps"]],
  ["Fieldnote Research", "Qualitative research consultancy.", ["UX research"]],
  ["Polaris Fund Services", "Bookkeeping for small nonprofits.", ["Nonprofit accounting", "Fundraising"]],
  ["Signal Policy Forum", null, ["Public policy", "Digital rights"]],
  ["Brightline Media", "Editorial and illustration studio.", ["Copywriting", "Illustration"]],
  ["Quarry Mobile", null, ["Mobile development", "Frontend development"]],
].map(([name, description, tags], index) => {
  const slug = (name as string).toLowerCase().replace(/[^a-z]+/g, "-");
  return {
    id: id("b", index + 1),
    name: name as string,
    description: description as string | null,
    website: `https://${slug}.example.org`,
    email: index % 3 === 0 ? `hello@${slug}.example.org` : null,
    expertiseIds: expertise(...(tags as string[])),
  };
});

export interface FixturePerson {
  id: string;
  name: string;
  stateKey: string | null;
  sourceKey: string | null;
  personalNote: string | null;
  doNotContact: boolean;
  email: string | null;
  phone: string | null;
  website: string | null;
  linkedin: string | null;
  x: string | null;
  otherContact: string | null;
  /** Days from the day the fixtures are loaded (negative = overdue), so "overdue" doesn't depend on the run date. */
  followUpInDays: number | null;
  createdAt: Date;
  organizationIds: string[];
  expertiseIds: string[];
}

const FIRST = ["Alex", "Bea", "Cyril", "Dina", "Emil", "Farah", "Gus", "Hana", "Ivo", "Juno", "Kai", "Lena", "Milo", "Nora", "Otto", "Pia"];
const LAST = ["Demo", "Sample", "Example", "Placeholder"];
// The admin suite counts on this cycle (e.g. 12 of 48 are "Sourced").
const STATES = ["sourced", "contacted", "collaborating", null] as const;
const SOURCES = ["candide", "ai", "contribution_email", null] as const;
const NOTES = [
  "Introduced through a partner organisation; interested in v0.1 testing.",
  "Asked to be contacted after the next release.",
  "Available for occasional reviews.",
  "Long-time contributor to open civic software.",
  null,
  "Prefers email over calls.",
  null,
];

/**
 * 48 people: several states (and none), every source (and none), 0–3
 * organizations, 1–4 expertise tags, a few do-not-contact flags, and
 * creation dates spread over the past year — enough to exercise search,
 * filters, sort and paging.
 */
export const FIXTURE_PEOPLE: FixturePerson[] = Array.from({ length: 48 }, (_, index) => {
  const first = FIRST[index % FIRST.length]!;
  const last = LAST[Math.floor(index / FIRST.length) % LAST.length]!;
  const slug = `${first}.${last}`.toLowerCase();
  const day = 24 * 60 * 60 * 1000;
  const base = Date.UTC(2026, 8, 30, 9, 0);
  const organizationCount = index % 4 === 0 ? 0 : (index % 3) + 1;
  const organizationIds = Array.from({ length: organizationCount }, (_, k) => FIXTURE_ORGANIZATIONS[(index + k * 5) % FIXTURE_ORGANIZATIONS.length]!.id);
  const tagCount = (index % 4) + 1;
  const expertiseIds = [...new Set(Array.from({ length: tagCount }, (_, k) => allItems[(index * 7 + k * 3) % allItems.length]!.id))];
  return {
    id: id("a", index + 1),
    name: `${first} ${last}`,
    stateKey: STATES[index % STATES.length]!,
    sourceKey: SOURCES[index % SOURCES.length]!,
    personalNote: NOTES[index % NOTES.length]!,
    doNotContact: index % 11 === 5,
    email: index % 5 === 4 ? null : `${slug}@example.org`,
    phone: index % 3 === 0 ? `+41 00 000 ${String(index).padStart(2, "0")} ${String(index * 3).padStart(2, "0").slice(-2)}` : null,
    website: index % 6 === 1 ? `https://${slug.replace(".", "-")}.example.org` : null,
    linkedin: index % 4 === 2 ? `https://www.linkedin.com/in/${slug.replace(".", "-")}-example` : null,
    x: index % 7 === 3 ? `@${slug.replace(".", "_")}_example` : null,
    otherContact: index % 9 === 8 ? "Signal on request" : null,
    followUpInDays: index % 3 === 1 ? (index % 20) - 10 : null,
    createdAt: new Date(base - index * 7 * day - (index % 5) * 3_600_000),
    organizationIds,
    expertiseIds,
  };
});
