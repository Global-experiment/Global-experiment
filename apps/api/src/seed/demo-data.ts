/**
 * DEMO DEVELOPMENT DATA — synthetic, non-sensitive records for showing the
 * native admin locally. No real client or person data: names are invented
 * combinations, emails use the reserved `example.org` domain, and every
 * note is generic. Every id lives in the reserved `de000000-…` range, which
 * is how the seed recognises (and only ever touches) its own rows.
 */

const KIND = { a: 1, b: 2, c: 3, d: 4, e: 5 } as const;

/** Valid RFC 4122 v4 UUIDs (strict validators accept them): de000000-<kind>000-4000-8000-<n>. */
const id = (kind: keyof typeof KIND, n: number) =>
  `de000000-${KIND[kind]}000-4000-8000-${n.toString(16).padStart(12, "0")}`;

export const DEMO_ID_PREFIX = "de000000-";

export interface DemoTaxonomy {
  domains: { id: string; name: string; fields: { id: string; name: string; items: { id: string; name: string }[] }[] }[];
}

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
export const DEMO_TAXONOMY: DemoTaxonomy = {
  domains: taxonomySource.map(([domainName, fields]) => ({
    id: id("c", ++domainN),
    name: domainName,
    fields: fields.map(([fieldName, items]) => ({
      id: id("d", ++fieldN),
      name: fieldName,
      items: items.map((itemName) => ({ id: id("e", ++itemN), name: itemName })),
    })),
  })),
};

const allItems = DEMO_TAXONOMY.domains.flatMap((domain) => domain.fields.flatMap((field) => field.items));
const itemByName = new Map(allItems.map((item) => [item.name, item.id]));
const expertise = (...names: string[]) => names.map((name) => itemByName.get(name)!);

export interface DemoOrganization {
  id: string;
  name: string;
  website: string | null;
  note: string | null;
  expertiseIds: string[];
}

export const DEMO_ORGANIZATIONS: DemoOrganization[] = [
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
].map(([name, note, tags], index) => ({
  id: id("b", index + 1),
  name: name as string,
  website: `https://${(name as string).toLowerCase().replace(/[^a-z]+/g, "-")}.example.org`,
  note: note as string | null,
  expertiseIds: expertise(...(tags as string[])),
}));

export interface DemoPerson {
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
  lastFollowupAt: Date | null;
  createdAt: Date;
  organizationIds: string[];
  expertiseIds: string[];
}

const FIRST = ["Alex", "Bea", "Cyril", "Dina", "Emil", "Farah", "Gus", "Hana", "Ivo", "Juno", "Kai", "Lena", "Milo", "Nora", "Otto", "Pia"];
const LAST = ["Demo", "Sample", "Example", "Placeholder"];
const STATES = ["sourced", "contacted", "collaborating", null] as const;
const SOURCES = ["candide", "ai", "contribution_email", "waitlist", "notion_import", null] as const;
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
 * 48 people: every state (and none), every source, 0–3 organizations,
 * 1–4 expertise tags, a few do-not-contact flags, and creation dates spread
 * over the past year — enough to exercise search, filters, sort and paging.
 */
export const DEMO_PEOPLE: DemoPerson[] = Array.from({ length: 48 }, (_, index) => {
  const first = FIRST[index % FIRST.length]!;
  const last = LAST[Math.floor(index / FIRST.length) % LAST.length]!;
  const slug = `${first}.${last}`.toLowerCase();
  const day = 24 * 60 * 60 * 1000;
  const base = Date.UTC(2026, 8, 30, 9, 0);
  const organizationCount = index % 4 === 0 ? 0 : (index % 3) + 1;
  const organizationIds = Array.from({ length: organizationCount }, (_, k) => DEMO_ORGANIZATIONS[(index + k * 5) % DEMO_ORGANIZATIONS.length]!.id);
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
    lastFollowupAt: index % 3 === 1 ? new Date(base - (index % 20) * day) : null,
    createdAt: new Date(base - index * 7 * day - (index % 5) * 3_600_000),
    organizationIds,
    expertiseIds,
  };
});
