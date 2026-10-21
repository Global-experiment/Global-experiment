import { RELATION_LIMITS } from "../../common/relation-limits.js";
import { demoMarkers } from "../demo-markers.js";
import { vocabularyMatcher, type Vocabulary } from "../taxonomy/taxonomy-plan.js";
import type { DirectorySource, SourceOrganization, SourcePerson } from "./directory-source.js";

/**
 * The People/Organizations import rules as one pure function: Notion
 * records + what the database holds → what to create, update, flag, skip,
 * link and unlink (docs/architecture/data-model.md §5). No I/O.
 *
 * - Demo records (example.org, "Fictional sample", DEMO-) are skipped and
 *   listed — never written.
 * - Matching by Notion page id only; never by name or email.
 * - Person ID / Organization ID set person_number / org_number; a number
 *   another row already holds is flagged and left unset for this record.
 * - State/Source by label; unknown values left empty and reported.
 * - Invalid or too long values left empty and flagged; the record stays.
 * - Possible duplicates (same name or email) and incomplete records (empty
 *   starred properties) are imported and flagged — never merged.
 * - Links: what Notion says is added; a link the database has but Notion
 *   doesn't is removed only between two records of this import (manual
 *   links to admin-made records are never touched).
 * - Records Notion no longer has are reported, never deleted.
 * - Relationship caps (common/relation-limits.ts): a person keeps at most
 *   5 organizations and 10 expertise, an organization 10 expertise. Over
 *   the cap, the first ones in Notion order are imported (after any links
 *   the import leaves alone), the record is flagged, and every link left
 *   out is listed.
 */

export type DirectoryKind = "organization" | "person";

export interface DbOrganization {
  id: string;
  notionPageId: string | null;
  orgNumber: number;
  name: string;
  description: string | null;
  website: string | null;
  email: string | null;
  wiseRecipientId: string | null;
}

export interface DbPerson {
  id: string;
  notionPageId: string | null;
  personNumber: number;
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
  wiseRecipientId: string | null;
  /** ISO instant (UTC). */
  nextFollowupAt: string | null;
}

export interface DirectorySnapshot {
  organizations: DbOrganization[];
  people: DbPerson[];
  personOrganization: { personId: string; organizationId: string }[];
  personExpertise: { personId: string; expertiseId: string }[];
  organizationExpertise: { organizationId: string; expertiseId: string }[];
  /** Expertise items imported from Notion: page id → row id. */
  expertiseByPage: Map<string, string>;
  /** Expertise row id → name, for reporting links left out over the limit. */
  expertiseNames?: Map<string, string>;
  states: Vocabulary[];
  sources: Vocabulary[];
}

export type IssueCode =
  | "demo_record"
  | "empty_name"
  | "name_too_long"
  | "invalid_value"
  | "unknown_state"
  | "unknown_source"
  | "number_taken"
  | "possible_duplicate"
  | "incomplete"
  | "unresolved_organization"
  | "unresolved_person"
  | "unresolved_expertise"
  | "over_limit"
  | "missing_from_notion";

export type IssueKind = "skipped" | "flagged" | "value_skipped" | "link_skipped" | "missing";

export interface Issue {
  kind: IssueKind;
  code: IssueCode;
  entity: DirectoryKind;
  name: string;
  pageId?: string;
  dbId?: string;
  detail: string;
}

export interface PlannedRecord<Values> {
  kind: DirectoryKind;
  pageId: string;
  action: "create" | "update" | "unchanged";
  dbId: string | null;
  values: Values;
  /** The number to set; null = keep the current one (update) or let the database assign one (create). */
  number: number | null;
  changes: string[];
}

export type OrganizationValues = Omit<DbOrganization, "id" | "orgNumber">;
export type PersonValues = Omit<DbPerson, "id" | "personNumber">;

/** A record on either side of a link: an existing row, or one this run creates (by page). */
export type Ref = { dbId: string } | { pageId: string };

export interface LinkPlan {
  add: { person: Ref; organization: Ref }[];
  remove: { personId: string; organizationId: string }[];
}

export interface ExpertiseLinkPlan {
  add: { owner: Ref; expertiseId: string }[];
  remove: { ownerId: string; expertiseId: string }[];
  /** False when Notion has no Expertise property: links are left alone. */
  synced: boolean;
}

export interface DirectoryPlan {
  organizations: PlannedRecord<OrganizationValues>[];
  people: PlannedRecord<PersonValues>[];
  personOrganization: LinkPlan;
  personExpertise: ExpertiseLinkPlan;
  organizationExpertise: ExpertiseLinkPlan;
  issues: Issue[];
  totals: { organizations: number; people: number; demo: { organizations: number; people: number } };
  ignored: { expensesLinks: number; accessGrantLinks: number; unreadProperties: string[] };
}

const LIMITS = { name: 200, note: 5000, email: 320, phone: 64, url: 2048, otherContact: 500, wise: 100 } as const;
const EMAIL = /^[^@\s]+@[^@\s]+$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_OR_DATE_TIME = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2}))?$/;

/** Zurich's offset from UTC (minutes) at an instant: +120 in summer, +60 in winter. */
function zurichOffsetMinutes(at: Date): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Zurich", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
      .formatToParts(at)
      .map((part) => [part.type, part.value]),
  );
  const local = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
  return Math.round((local - at.getTime()) / 60_000);
}

/**
 * The follow-up as an instant: a date-time as written; a date alone is that
 * day at 09:00 in Zurich — the rule migration 0010 applied to existing dates.
 */
export function followUpInstant(value: string | null): string | null {
  if (value === null) return null;
  if (DATE.test(value)) {
    const nineUtc = new Date(`${value}T09:00:00Z`);
    return new Date(nineUtc.getTime() - zurichOffsetMinutes(nineUtc) * 60_000).toISOString();
  }
  const instant = new Date(value);
  return Number.isNaN(instant.getTime()) ? null : instant.toISOString();
}
const byCreation = (a: { createdTime: string; pageId: string }, b: { createdTime: string; pageId: string }) =>
  a.createdTime.localeCompare(b.createdTime) || a.pageId.localeCompare(b.pageId);
const key = (value: string | null) => value?.trim().toLowerCase() || null;
const refKey = (ref: Ref) => ("dbId" in ref ? `db:${ref.dbId}` : `page:${ref.pageId}`);
const overLimitDetail = (what: string, total: number, limit: number, imported: number, kept: number, left: number) =>
  `Has ${total} ${what} (max ${limit}): ${kept > 0 ? `${kept} existing kept, ` : ""}the first ${imported} from Notion imported, ${left} left out (listed under Links skipped).`;

export function planDirectoryImport(source: DirectorySource, snapshot: DirectorySnapshot): DirectoryPlan {
  const issues: Issue[] = [];
  const state = vocabularyMatcher(snapshot.states);
  const sourceVocabulary = vocabularyMatcher(snapshot.sources);

  const issue = (entity: DirectoryKind, record: { pageId: string; name: string }, kind: IssueKind, code: IssueCode, detail: string) =>
    issues.push({ kind, code, entity, name: record.name.trim() || "(no name)", pageId: record.pageId, detail });

  /** A text value within its limit, or null and a flag. */
  const checked = (entity: DirectoryKind, record: { pageId: string; name: string }, label: string, value: string | null, max: number, pattern?: RegExp) => {
    if (value === null) return null;
    if (value.length > max) {
      issue(entity, record, "flagged", "invalid_value", `${label} is ${value.length} characters (max ${max}); left empty.`);
      return null;
    }
    if (pattern && !pattern.test(value)) {
      issue(entity, record, "flagged", "invalid_value", `${label} "${value}" isn't valid; left empty.`);
      return null;
    }
    return value;
  };

  const demo = { organizations: 0, people: 0 };
  /** Demo or unusable records are skipped; their page ids can't be linked to. */
  const usable = <T extends SourceOrganization | SourcePerson>(records: T[]): T[] =>
    [...records].sort(byCreation).filter((record) => {
      const entity = record.kind;
      const markers = demoMarkers({
        emails: [record.email],
        urls: [record.website, ...(record.kind === "person" ? [record.linkedin, record.x] : [])],
        texts: [
          record.name,
          record.wiseRecipientId,
          ...(record.kind === "person" ? [record.personalNote, record.otherContact, record.phone] : [record.description]),
        ],
      });
      if (markers.length > 0) {
        if (entity === "person") demo.people++;
        else demo.organizations++;
        issue(entity, record, "skipped", "demo_record", `Demo record (${markers.join(", ")}): not imported.`);
        return false;
      }
      if (!record.name.trim()) {
        issue(entity, record, "skipped", "empty_name", "The Notion record has no name.");
        return false;
      }
      if (record.name.trim().length > LIMITS.name) {
        issue(entity, record, "skipped", "name_too_long", `The name is ${record.name.trim().length} characters (max ${LIMITS.name}).`);
        return false;
      }
      return true;
    });

  const organizations = usable(source.organizations);
  const people = usable(source.people);

  // ---- Records -----------------------------------------------------------

  function planRecords<Source extends SourceOrganization | SourcePerson, Db extends DbOrganization | DbPerson, Values>(
    entity: DirectoryKind,
    records: Source[],
    rows: Db[],
    numberOf: (row: Db) => number,
    valuesOf: (record: Source) => Values,
    fields: (keyof Values)[],
  ): PlannedRecord<Values>[] {
    const byPage = new Map(rows.filter((row) => row.notionPageId).map((row) => [row.notionPageId!, row]));
    const matched = new Map(records.map((record) => [record.pageId, byPage.get(record.pageId)]));
    const claimed = new Set([...matched.values()].filter(Boolean).map((row) => row!.id));

    // Numbers: Notion's number unless another row holds it (that row keeps it).
    const owner = new Map<number, string>(); // number → row id (or "page:" for creates)
    for (const row of rows) if (!claimed.has(row.id)) owner.set(numberOf(row), row.id);
    for (const record of records) {
      const row = matched.get(record.pageId);
      if (row && record.number === null) owner.set(numberOf(row), row.id);
    }
    const finalNumber = new Map<string, number | null>();
    let changed = true;
    const pending = records.filter((record) => record.number !== null);
    while (changed) {
      changed = false;
      for (const record of pending) {
        if (finalNumber.has(record.pageId)) continue;
        const row = matched.get(record.pageId);
        const self = row?.id ?? `page:${record.pageId}`;
        const holder = owner.get(record.number!);
        if (holder !== undefined && holder !== self) {
          issue(entity, record, "flagged", "number_taken", `${entity === "person" ? "PER" : "ORG"}-${record.number} already belongs to another record; ${row ? `keeps ${entity === "person" ? "PER" : "ORG"}-${numberOf(row)}` : "gets the next free number"}.`);
          finalNumber.set(record.pageId, null);
          if (row) {
            // It keeps its current number, which may displace a record already given it.
            const displaced = [...finalNumber].find(([page, number]) => page !== record.pageId && number === numberOf(row));
            if (displaced) {
              finalNumber.delete(displaced[0]);
              changed = true;
            }
            owner.set(numberOf(row), row.id);
          }
        } else {
          finalNumber.set(record.pageId, record.number);
          owner.set(record.number!, self);
        }
      }
    }

    return records.map((record) => {
      const row = matched.get(record.pageId);
      const values = valuesOf(record);
      const number = finalNumber.get(record.pageId) ?? null;
      const changes: string[] = [];
      if (row) {
        for (const field of fields) if ((row as unknown as Values)[field] !== values[field]) changes.push(String(field));
        if (number !== null && number !== numberOf(row)) changes.push("number");
      }
      return {
        kind: entity,
        pageId: record.pageId,
        action: row ? (changes.length > 0 ? "update" : "unchanged") : "create",
        dbId: row?.id ?? null,
        values,
        number: row && number === numberOf(row) ? null : number,
        changes,
      } satisfies PlannedRecord<Values>;
    });
  }

  const plannedOrganizations = planRecords<SourceOrganization, DbOrganization, OrganizationValues>(
    "organization",
    organizations,
    snapshot.organizations,
    (row) => row.orgNumber,
    (record) => ({
      notionPageId: record.pageId,
      name: record.name.trim(),
      description: checked("organization", record, "Description", record.description, LIMITS.note),
      website: checked("organization", record, "Website", record.website, LIMITS.url),
      email: checked("organization", record, "Email", record.email, LIMITS.email, EMAIL),
      wiseRecipientId: checked("organization", record, "Wise recipient account ID", record.wiseRecipientId, LIMITS.wise),
    }),
    ["notionPageId", "name", "description", "website", "email", "wiseRecipientId"],
  );

  const plannedPeople = planRecords<SourcePerson, DbPerson, PersonValues>(
    "person",
    people,
    snapshot.people,
    (row) => row.personNumber,
    (record) => {
      const stateKey = record.state ? (state(record.state) ?? null) : null;
      if (record.state && !stateKey) issue("person", record, "value_skipped", "unknown_state", `Unknown state "${record.state}" left empty.`);
      const sourceKey = record.source ? (sourceVocabulary(record.source) ?? null) : null;
      if (record.source && !sourceKey) issue("person", record, "value_skipped", "unknown_source", `Unknown source "${record.source}" left empty.`);
      return {
        notionPageId: record.pageId,
        name: record.name.trim(),
        stateKey,
        sourceKey,
        personalNote: checked("person", record, "Personal note", record.personalNote, LIMITS.note),
        doNotContact: record.doNotContact,
        email: checked("person", record, "Email", record.email, LIMITS.email, EMAIL),
        phone: checked("person", record, "Phone", record.phone, LIMITS.phone),
        website: checked("person", record, "Website", record.website, LIMITS.url),
        linkedin: checked("person", record, "LinkedIn", record.linkedin, LIMITS.url),
        x: checked("person", record, "X", record.x, LIMITS.url),
        otherContact: checked("person", record, "Other contact details", record.otherContact, LIMITS.otherContact),
        wiseRecipientId: checked("person", record, "Wise recipient account ID", record.wiseRecipientId, LIMITS.wise),
        nextFollowupAt: followUpInstant(checked("person", record, "Follow-up date", record.nextFollowupAt, 40, DATE_OR_DATE_TIME)),
      };
    },
    ["notionPageId", "name", "stateKey", "sourceKey", "personalNote", "doNotContact", "email", "phone", "website", "linkedin", "x", "otherContact", "wiseRecipientId", "nextFollowupAt"],
  );

  // Incomplete (empty starred properties) and possible duplicates: imported, flagged.
  for (const record of [...organizations, ...people]) {
    if (record.missingRequired.length > 0) {
      issue(record.kind, record, "flagged", "incomplete", `Required for completeness but empty: ${record.missingRequired.join(", ")}.`);
    }
  }
  const duplicates = <Db extends { id: string; notionPageId: string | null; name: string; email: string | null }>(
    entity: DirectoryKind,
    planned: PlannedRecord<{ name: string; email: string | null }>[],
    rows: Db[],
  ) => {
    const plannedIds = new Set(planned.map((record) => record.dbId).filter(Boolean));
    const everyone = [
      ...planned.map((record) => ({ ref: record.dbId ?? `page:${record.pageId}`, name: record.values.name, email: record.values.email })),
      ...rows.filter((row) => !plannedIds.has(row.id)).map((row) => ({ ref: row.id, name: row.name, email: row.email })),
    ];
    for (const record of planned) {
      const self = record.dbId ?? `page:${record.pageId}`;
      const sameName = everyone.filter((other) => other.ref !== self && key(other.name) === key(record.values.name));
      const sameEmail = record.values.email ? everyone.filter((other) => other.ref !== self && key(other.email) === key(record.values.email)) : [];
      const reasons = [
        ...(sameName.length ? [`same name as ${sameName.length} other ${entity === "person" ? "person" : "organization"}${sameName.length > 1 ? "s" : ""}`] : []),
        ...(sameEmail.length ? [`same email as ${sameEmail.map((other) => other.name).join(", ")}`] : []),
      ];
      if (reasons.length > 0) issue(entity, { pageId: record.pageId, name: record.values.name }, "flagged", "possible_duplicate", `Possible duplicate (${reasons.join("; ")}): imported separately, never merged.`);
    }
  };
  duplicates("organization", plannedOrganizations, snapshot.organizations);
  duplicates("person", plannedPeople, snapshot.people);

  // ---- Links -------------------------------------------------------------

  const orgRef = new Map(plannedOrganizations.map((record) => [record.pageId, record.dbId ? { dbId: record.dbId } : { pageId: record.pageId }] as const));
  const personRef = new Map(plannedPeople.map((record) => [record.pageId, record.dbId ? { dbId: record.dbId } : { pageId: record.pageId }] as const));
  const sourceName = new Map([...source.organizations, ...source.people].map((record) => [record.pageId, record.name.trim() || "(no name)"]));
  const skippedPages = new Set([...source.organizations, ...source.people].map((record) => record.pageId).filter((page) => !orgRef.has(page) && !personRef.has(page)));
  const reportedLinks = new Set<string>();
  const linkSkipped = (entity: DirectoryKind, from: { pageId: string; name: string }, code: IssueCode, detail: string) => {
    const id = `${from.pageId}|${detail}`;
    if (reportedLinks.has(id)) return;
    reportedLinks.add(id);
    issue(entity, from, "link_skipped", code, detail);
  };

  // Person ↔ Organization: Notion keeps both sides; read both and take the union.
  const pairs = new Map<string, { person: Ref; organization: Ref }>();
  const addPair = (personPage: string, organizationPage: string, reportFrom: { entity: DirectoryKind; pageId: string; name: string }) => {
    const person = personRef.get(personPage);
    const organization = orgRef.get(organizationPage);
    if (!person) {
      linkSkipped(reportFrom.entity, reportFrom, "unresolved_person", `Link to person "${sourceName.get(personPage) ?? personPage}" skipped: ${skippedPages.has(personPage) ? "that person isn't imported" : "not a person in the People database"}.`);
      return;
    }
    if (!organization) {
      linkSkipped(reportFrom.entity, reportFrom, "unresolved_organization", `Link to organization "${sourceName.get(organizationPage) ?? organizationPage}" skipped: ${skippedPages.has(organizationPage) ? "that organization isn't imported" : "not an organization in the Organizations database"}.`);
      return;
    }
    pairs.set(`${refKey(person)}|${refKey(organization)}`, { person, organization });
  };
  for (const person of people) for (const page of person.organizationPageIds) addPair(person.pageId, page, { entity: "person", pageId: person.pageId, name: person.name });
  for (const organization of organizations) for (const page of organization.peoplePageIds) addPair(page, organization.pageId, { entity: "organization", pageId: organization.pageId, name: organization.name });

  const existingPairs = new Set(snapshot.personOrganization.map((link) => `db:${link.personId}|db:${link.organizationId}`));
  const importedPeople = new Set(plannedPeople.map((record) => record.dbId).filter(Boolean));
  const importedOrganizations = new Set(plannedOrganizations.map((record) => record.dbId).filter(Boolean));

  // Cap: a person keeps at most 5 organizations. Links this import leaves
  // alone (to admin-made records) count first, then Notion's in Notion order
  // (the person's own list, then links read from the organizations' side).
  const keptOrganizations = new Map<string, number>();
  for (const link of snapshot.personOrganization) {
    if (importedPeople.has(link.personId) && importedOrganizations.has(link.organizationId)) continue;
    keptOrganizations.set(`db:${link.personId}`, (keptOrganizations.get(`db:${link.personId}`) ?? 0) + 1);
  }
  const personByRef = new Map(people.map((record) => [refKey(personRef.get(record.pageId)!), record]));
  const organizationName = new Map(plannedOrganizations.map((record) => [refKey(orgRef.get(record.pageId)!), record.values.name]));
  const pairsByPerson = new Map<string, string[]>();
  for (const [id, pair] of pairs) pairsByPerson.set(refKey(pair.person), [...(pairsByPerson.get(refKey(pair.person)) ?? []), id]);
  for (const [personKey, ids] of pairsByPerson) {
    const kept = keptOrganizations.get(personKey) ?? 0;
    const allowance = Math.max(0, RELATION_LIMITS.organizationsPerPerson - kept);
    if (ids.length <= allowance) continue;
    const person = personByRef.get(personKey)!;
    const left = ids.slice(allowance).map((id) => {
      const pair = pairs.get(id)!;
      pairs.delete(id);
      return organizationName.get(refKey(pair.organization)) ?? "(unknown)";
    });
    issue("person", person, "flagged", "over_limit", overLimitDetail("organizations", ids.length + kept, RELATION_LIMITS.organizationsPerPerson, allowance, kept, left.length));
    for (const name of left) {
      linkSkipped("person", person, "over_limit", `Link to organization "${name}" left out: over the limit of ${RELATION_LIMITS.organizationsPerPerson} organizations per person.`);
    }
  }
  const personOrganization: LinkPlan = {
    add: [...pairs].filter(([id]) => !existingPairs.has(id)).map(([, pair]) => pair),
    // Only between two records of this import: links to admin-made (or skipped / vanished) records stay.
    remove: snapshot.personOrganization.filter(
      (link) => importedPeople.has(link.personId) && importedOrganizations.has(link.organizationId) && !pairs.has(`db:${link.personId}|db:${link.organizationId}`),
    ),
  };

  const expertiseLinks = <Owner extends SourceOrganization | SourcePerson>(
    entity: DirectoryKind,
    owners: Owner[],
    refs: Map<string, Ref>,
    existing: { ownerId: string; expertiseId: string }[],
    imported: Set<string | null>,
  ): ExpertiseLinkPlan => {
    // Only when Notion has an Expertise property; otherwise existing links are left alone.
    if (source.layouts[entity === "person" ? "people" : "organizations"].absent.includes("Expertise")) return { add: [], remove: [], synced: false };
    const notionExpertise = new Set(snapshot.expertiseByPage.values());
    const desired = new Map<string, { owner: Ref; expertiseId: string }>();
    for (const owner of owners) {
      const ref = refs.get(owner.pageId)!;
      for (const page of owner.expertisePageIds ?? []) {
        const expertiseId = snapshot.expertiseByPage.get(page);
        if (!expertiseId) {
          linkSkipped(entity, owner, "unresolved_expertise", `Expertise link to Notion page ${page} skipped: it isn't an imported Expertise item (the taxonomy holds only Expertise-level items).`);
          continue;
        }
        desired.set(`${refKey(ref)}|${expertiseId}`, { owner: ref, expertiseId });
      }
    }
    // Cap: at most 10 expertise per owner. Links this import never removes
    // (to admin-made expertise, or on records outside the import) count first.
    const kept = new Map<string, number>();
    for (const link of existing) {
      if (imported.has(link.ownerId) && notionExpertise.has(link.expertiseId)) continue;
      kept.set(`db:${link.ownerId}`, (kept.get(`db:${link.ownerId}`) ?? 0) + 1);
    }
    const ownerByRef = new Map(owners.map((owner) => [refKey(refs.get(owner.pageId)!), owner]));
    const byOwner = new Map<string, string[]>();
    for (const [id, link] of desired) byOwner.set(refKey(link.owner), [...(byOwner.get(refKey(link.owner)) ?? []), id]);
    for (const [ownerKey, ids] of byOwner) {
      const keptCount = kept.get(ownerKey) ?? 0;
      const allowance = Math.max(0, RELATION_LIMITS.expertise - keptCount);
      if (ids.length <= allowance) continue;
      const owner = ownerByRef.get(ownerKey)!;
      const left = ids.slice(allowance).map((id) => {
        const { expertiseId } = desired.get(id)!;
        desired.delete(id);
        return snapshot.expertiseNames?.get(expertiseId) ?? expertiseId;
      });
      issue(entity, owner, "flagged", "over_limit", overLimitDetail("expertise", ids.length + keptCount, RELATION_LIMITS.expertise, allowance, keptCount, left.length));
      for (const name of left) {
        linkSkipped(entity, owner, "over_limit", `Expertise link to "${name}" left out: over the limit of ${RELATION_LIMITS.expertise} expertise per ${entity}.`);
      }
    }
    const existingKeys = new Set(existing.map((link) => `db:${link.ownerId}|${link.expertiseId}`));
    return {
      add: [...desired].filter(([id]) => !existingKeys.has(id)).map(([, link]) => link),
      // Only links to Notion taxonomy items, on records of this import.
      remove: existing.filter((link) => imported.has(link.ownerId) && notionExpertise.has(link.expertiseId) && !desired.has(`db:${link.ownerId}|${link.expertiseId}`)),
      synced: true,
    };
  };
  const personExpertise = expertiseLinks(
    "person",
    people,
    personRef,
    snapshot.personExpertise.map((link) => ({ ownerId: link.personId, expertiseId: link.expertiseId })),
    importedPeople,
  );
  const organizationExpertise = expertiseLinks(
    "organization",
    organizations,
    orgRef,
    snapshot.organizationExpertise.map((link) => ({ ownerId: link.organizationId, expertiseId: link.expertiseId })),
    importedOrganizations,
  );

  // ---- Records Notion no longer has --------------------------------------

  const notionPages = new Set([...source.organizations, ...source.people].map((record) => record.pageId));
  for (const row of snapshot.organizations) {
    if (row.notionPageId && !notionPages.has(row.notionPageId)) {
      issues.push({ kind: "missing", code: "missing_from_notion", entity: "organization", name: row.name, dbId: row.id, detail: `ORG-${row.orgNumber} is no longer in Notion; left as it is.` });
    }
  }
  for (const row of snapshot.people) {
    if (row.notionPageId && !notionPages.has(row.notionPageId)) {
      issues.push({ kind: "missing", code: "missing_from_notion", entity: "person", name: row.name, dbId: row.id, detail: `PER-${row.personNumber} is no longer in Notion; left as it is.` });
    }
  }

  return {
    organizations: plannedOrganizations,
    people: plannedPeople,
    personOrganization,
    personExpertise,
    organizationExpertise,
    issues,
    totals: { organizations: source.organizations.length, people: source.people.length, demo },
    ignored: {
      expensesLinks: [...source.organizations, ...source.people].reduce((sum, record) => sum + record.expensesCount, 0),
      accessGrantLinks: source.people.reduce((sum, record) => sum + record.accessGrantsCount, 0),
      unreadProperties: [
        ...source.layouts.people.unread.map((name) => `People: ${name}`),
        ...source.layouts.organizations.unread.map((name) => `Organizations: ${name}`),
      ],
    },
  };
}

/** Why --apply must not run: a run made only of demo records. */
export function onlyDemoRefusal(plan: DirectoryPlan): string | undefined {
  const total = plan.totals.organizations + plan.totals.people;
  const demo = plan.totals.demo.organizations + plan.totals.demo.people;
  if (total > 0 && demo === total) {
    return `Refusing to apply: all ${total} Notion records (${plan.totals.people} people, ${plan.totals.organizations} organizations) are demo records (example.org, "Fictional sample", DEMO-). Nothing real to import yet — run --dry-run to review.`;
  }
  return undefined;
}

export interface DirectoryCounts {
  organization: { created: number; updated: number; unchanged: number; flagged: number; skipped: number; demo: number; missing: number };
  person: { created: number; updated: number; unchanged: number; flagged: number; skipped: number; demo: number; missing: number };
  links: {
    personOrganization: { added: number; removed: number };
    personExpertise: { added: number; removed: number; synced: boolean };
    organizationExpertise: { added: number; removed: number; synced: boolean };
    skipped: number;
  };
  ignored: { expensesLinks: number; accessGrantLinks: number };
  /** Records created + updated + links added + removed: 0 means the database already matches Notion. */
  changes: number;
}

export function countDirectoryPlan(plan: DirectoryPlan): DirectoryCounts {
  const counts = (entity: DirectoryKind, records: PlannedRecord<unknown>[]) => {
    const of = (kind: IssueKind, code?: IssueCode) => plan.issues.filter((issue) => issue.entity === entity && issue.kind === kind && (!code || issue.code === code));
    return {
      created: records.filter((record) => record.action === "create").length,
      updated: records.filter((record) => record.action === "update").length,
      unchanged: records.filter((record) => record.action === "unchanged").length,
      flagged: new Set(of("flagged").map((issue) => issue.pageId)).size,
      skipped: of("skipped").length,
      demo: of("skipped", "demo_record").length,
      missing: of("missing").length,
    };
  };
  const organization = counts("organization", plan.organizations);
  const person = counts("person", plan.people);
  const links = {
    personOrganization: { added: plan.personOrganization.add.length, removed: plan.personOrganization.remove.length },
    personExpertise: { added: plan.personExpertise.add.length, removed: plan.personExpertise.remove.length, synced: plan.personExpertise.synced },
    organizationExpertise: { added: plan.organizationExpertise.add.length, removed: plan.organizationExpertise.remove.length, synced: plan.organizationExpertise.synced },
    skipped: plan.issues.filter((issue) => issue.kind === "link_skipped").length,
  };
  const changes =
    organization.created + organization.updated + person.created + person.updated +
    links.personOrganization.added + links.personOrganization.removed +
    links.personExpertise.added + links.personExpertise.removed +
    links.organizationExpertise.added + links.organizationExpertise.removed;
  return { organization, person, links, ignored: { expensesLinks: plan.ignored.expensesLinks, accessGrantLinks: plan.ignored.accessGrantLinks }, changes };
}
