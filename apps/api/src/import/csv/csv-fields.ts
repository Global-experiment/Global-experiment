/**
 * The fields a CSV column can fill, per table, with the header names that
 * match them automatically (case, spaces and punctuation ignored). Display
 * numbers (PER-n, ORG-n, GE-n) are never read: they aren't identities and
 * will be replaced by random ids; a record's UUID ("ID") is only used to
 * spot a duplicate.
 */

export type CsvTable = "people" | "organizations";
export const CSV_TABLES: readonly CsvTable[] = ["people", "organizations"];

export type CsvFieldKind = "text" | "email" | "link" | "date" | "datetime" | "boolean" | "score" | "select" | "relation" | "id";

export interface CsvField {
  key: string;
  label: string;
  kind: CsvFieldKind;
  required?: boolean;
  /** Header names that map here automatically, besides the label. */
  aliases?: string[];
}

const PEOPLE: CsvField[] = [
  { key: "name", label: "Name", kind: "text", required: true, aliases: ["full name", "person", "people"] },
  { key: "email", label: "Email", kind: "email", aliases: ["e-mail", "email address", "mail"] },
  { key: "description", label: "Description", kind: "text", aliases: ["personal note", "note", "notes", "bio"] },
  { key: "state", label: "State", kind: "select", aliases: ["status", "stage"] },
  { key: "source", label: "Source", kind: "select" },
  { key: "website", label: "Website", kind: "link", aliases: ["site", "url", "web"] },
  { key: "linkedin", label: "LinkedIn", kind: "link", aliases: ["linked in", "linkedin url"] },
  { key: "x", label: "X", kind: "link", aliases: ["twitter", "x twitter", "x (twitter)"] },
  { key: "otherSocials", label: "Other socials", kind: "link", aliases: ["other social", "socials"] },
  { key: "phone", label: "Phone", kind: "text", aliases: ["phone number", "telephone", "mobile"] },
  { key: "otherContact", label: "Other contact details", kind: "text", aliases: ["other contact", "contact details"] },
  { key: "contactChannels", label: "Contact channels", kind: "relation", aliases: ["contact channel", "channels"] },
  { key: "doNotContact", label: "Do not contact", kind: "boolean", aliases: ["dnc"] },
  { key: "relevanceScore", label: "Relevance score", kind: "score", aliases: ["relevance"] },
  { key: "organizations", label: "Organizations", kind: "relation", aliases: ["organization", "organisation", "organisations", "company"] },
  { key: "expertise", label: "Expertise", kind: "relation", aliases: ["skills", "expertises"] },
  { key: "firstContactOn", label: "First contact", kind: "date", aliases: ["first contact date"] },
  { key: "lastContactOn", label: "Last contact", kind: "date", aliases: ["last contact date"] },
  { key: "nextFollowupAt", label: "Follow-up date", kind: "datetime", aliases: ["follow up", "follow-up", "next follow-up", "follow up date"] },
  { key: "wiseRecipientId", label: "Wise recipient ID", kind: "text", aliases: ["wise id", "wise recipient"] },
  { key: "id", label: "ID (UUID)", kind: "id", aliases: ["id", "uuid", "record id"] },
];

const ORGANIZATIONS: CsvField[] = [
  { key: "name", label: "Name", kind: "text", required: true, aliases: ["organization", "organisation", "organization name", "company"] },
  { key: "description", label: "Description", kind: "text", aliases: ["note", "notes", "about"] },
  { key: "website", label: "Website", kind: "link", aliases: ["site", "url", "web"] },
  { key: "email", label: "Email", kind: "email", aliases: ["e-mail", "email address", "mail"] },
  { key: "expertise", label: "Expertise", kind: "relation", aliases: ["skills", "expertises"] },
  { key: "wiseRecipientId", label: "Wise recipient ID", kind: "text", aliases: ["wise id", "wise recipient"] },
  { key: "id", label: "ID (UUID)", kind: "id", aliases: ["id", "uuid", "record id"] },
];

export const CSV_FIELDS: Record<CsvTable, readonly CsvField[]> = { people: PEOPLE, organizations: ORGANIZATIONS };

const normal = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Header → field key, or null (skip). Each field is used at most once: the first matching column wins. */
export function autoMapping(table: CsvTable, headers: readonly string[]): (string | null)[] {
  const used = new Set<string>();
  return headers.map((header) => {
    const name = normal(header);
    if (!name) return null;
    const field = CSV_FIELDS[table].find((candidate) => !used.has(candidate.key) && [candidate.label, ...(candidate.aliases ?? [])].some((alias) => normal(alias) === name));
    if (!field) return null;
    used.add(field.key);
    return field.key;
  });
}
