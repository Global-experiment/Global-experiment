import type { ZodType } from "zod";
import { followUpInstant } from "../follow-up.js";
import { vocabularyMatcher, type Vocabulary } from "../vocabulary.js";
import { CreateOrganizationRequest } from "../../organizations/organizations.contracts.js";
import { CreatePersonRequest } from "../../people/people.contracts.js";
import { CSV_FIELDS, type CsvField, type CsvTable } from "./csv-fields.js";
import type { ParsedCsv } from "./csv-parse.js";
import { comparable, comparableUrl, DISPLAY_NUMBER, parseBoolean, parseDate, parseInstant, splitNames, UUID, withoutNotionLink } from "./csv-values.js";

/**
 * A CSV import's plan, as one pure function (no I/O): each row mapped,
 * checked with the detail page's own rules (the same request schema), its
 * relations found by name, and compared with what exists to flag possible
 * duplicates. Nothing here writes; csv-import.service.ts applies a plan in
 * one transaction.
 *
 * Duplicates (never overwritten, skipped unless the admin includes the
 * row): the same record UUID, email, website or name as an existing record
 * — or as an earlier row of the file. Display numbers (PER-n, ORG-n, GE-n)
 * are never compared.
 *
 * Unknown values (OPS-153): a State, Source, Contact channel, Organization
 * or Expertise the admin doesn't have (or has twice) never refuses a row.
 * The plan lists each such value once (`unknown`), the admin maps it to an
 * existing one or skips it (`choices`), and a row whose value stays
 * unresolved is imported without it, with a warning. Names match ignoring
 * case, accents and extra spaces. Real errors (no name, an invalid email…)
 * still refuse the row.
 */

/** The columns whose values must name something that exists. */
export const VALUE_FIELDS = ["state", "source", "contactChannels", "organizations", "expertise"] as const;
export type ValueField = (typeof VALUE_FIELDS)[number];
/** Per field: an unknown value (its comparable form) → an existing key or id, or null to skip it. */
export type ValueChoices = Partial<Record<ValueField, Record<string, string | null>>>;

export interface CsvUnknownValue {
  /** As first written in the file (Notion's link suffix removed). */
  value: string;
  /** Its comparable form: the key of `choices`. */
  key: string;
  rows: number;
  /** "several" when more than one record has this name. */
  problem: "unknown" | "several";
  /** The admin's choice: an option's id, null = skip, undefined = not chosen. */
  choice?: string | null;
}

export interface CsvUnknownField {
  field: ValueField;
  label: string;
  values: CsvUnknownValue[];
  /** What each value can be mapped to. */
  options: { id: string; label: string }[];
}

export interface Ref {
  id: string;
  name: string;
}

export interface CsvSnapshot {
  /** Every record of the table, archived ones too. */
  records: (Ref & { email: string | null; website: string | null })[];
  states: Vocabulary[];
  sources: Vocabulary[];
  channels: Vocabulary[];
  organizations: Ref[];
  expertise: Ref[];
}

export interface CsvDuplicate {
  reason: string;
  /** The existing record, or null when it's an earlier row of the file. */
  existing: Ref | null;
  line: number | null;
}

export interface CsvPlanRow {
  /** The row's line in the file (the header is line 1). */
  line: number;
  name: string;
  status: "create" | "duplicate" | "error";
  errors: string[];
  /** Values left out of the record (OPS-153). */
  warnings: string[];
  duplicate: CsvDuplicate | null;
  /** A possible duplicate the admin chose to import anyway. */
  included: boolean;
  /** The create request (valid rows only). */
  request: Record<string, unknown> | null;
}

export interface CsvPlan {
  table: CsvTable;
  fileName: string;
  mapping: (string | null)[];
  rows: CsvPlanRow[];
  unknown: CsvUnknownField[];
}

export class CsvMappingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CsvMappingError";
  }
}

const SCHEMA: Record<CsvTable, ZodType> = { people: CreatePersonRequest, organizations: CreateOrganizationRequest };

/** Request field → the CSV field it comes from (for error messages). */
const REQUEST_FIELD: Record<string, string> = {
  stateKey: "state",
  sourceKey: "source",
  contactChannelKeys: "contactChannels",
  organizationIds: "organizations",
  expertiseIds: "expertise",
};

/** Checks the column → field choices: known fields, each at most once, Name present. */
export function checkMapping(table: CsvTable, headers: readonly string[], mapping: readonly (string | null)[]): void {
  if (mapping.length !== headers.length) throw new CsvMappingError("The column choices don't match the file's columns: upload the file again.");
  const keys = new Set(CSV_FIELDS[table].map((field) => field.key));
  const used = new Set<string>();
  for (const key of mapping) {
    if (key === null) continue;
    if (!keys.has(key)) throw new CsvMappingError(`Unknown field "${key}".`);
    if (used.has(key))
      throw new CsvMappingError(`Two columns are set to ${CSV_FIELDS[table].find((field) => field.key === key)!.label}: choose one, skip the other.`);
    used.add(key);
  }
  if (!used.has("name")) throw new CsvMappingError("Choose the column that holds the Name: every record needs one.");
}

/** Name → ids, for resolving relations by name (names may repeat). */
function byName(refs: readonly Ref[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const ref of refs) {
    const key = comparable(ref.name);
    map.set(key, [...(map.get(key) ?? []), ref.id]);
  }
  return map;
}

interface Indexes {
  id: Map<string, Ref>;
  email: Map<string, Ref>;
  website: Map<string, Ref>;
  name: Map<string, Ref>;
}

const emptyIndexes = (): Indexes => ({ id: new Map(), email: new Map(), website: new Map(), name: new Map() });

function index(target: Indexes, ref: Ref, keys: { id: string | null; email: string | null; website: string | null }) {
  const add = (map: Map<string, Ref>, key: string | null) => {
    if (key && !map.has(key)) map.set(key, ref);
  };
  add(target.id, keys.id?.toLowerCase() ?? null);
  add(target.email, keys.email ? keys.email.trim().toLowerCase() : null);
  add(target.website, keys.website ? comparableUrl(keys.website) : null);
  add(target.name, comparable(ref.name));
}

function findDuplicate(
  indexes: Indexes,
  keys: { id: string | null; email: string | null; website: string | null; name: string },
): { what: string; ref: Ref } | null {
  const checks: [string, Map<string, Ref>, string | null][] = [
    ["ID", indexes.id, keys.id?.toLowerCase() ?? null],
    ["email", indexes.email, keys.email ? keys.email.trim().toLowerCase() : null],
    ["website", indexes.website, keys.website ? comparableUrl(keys.website) : null],
    ["name", indexes.name, comparable(keys.name)],
  ];
  for (const [what, map, key] of checks) {
    const ref = key ? map.get(key) : undefined;
    if (ref) return { what, ref };
  }
  return null;
}

/** Each value field's options (what an unknown value can be mapped to) and how a name finds them. */
function valueLookups(snapshot: CsvSnapshot) {
  const vocabulary = (entries: Vocabulary[]) => {
    const match = vocabularyMatcher(entries);
    return { options: entries.map((entry) => ({ id: entry.key, label: entry.label })), find: (name: string) => (match(name) ? [match(name)!] : []) };
  };
  const named = (refs: readonly Ref[]) => {
    const map = byName(refs);
    return {
      options: [...refs].sort((a, b) => a.name.localeCompare(b.name)).map((ref) => ({ id: ref.id, label: ref.name })),
      find: (name: string) => map.get(comparable(name)) ?? [],
    };
  };
  return {
    state: vocabulary(snapshot.states),
    source: vocabulary(snapshot.sources),
    contactChannels: vocabulary(snapshot.channels),
    organizations: named(snapshot.organizations),
    expertise: named(snapshot.expertise),
  } satisfies Record<ValueField, { options: { id: string; label: string }[]; find: (name: string) => string[] }>;
}

const WHAT: Record<ValueField, string> = {
  state: "state",
  source: "source",
  contactChannels: "contact channel",
  organizations: "organization",
  expertise: "expertise",
};

export function planCsvImport(
  input: { table: CsvTable; fileName: string; parsed: ParsedCsv; mapping: readonly (string | null)[]; include?: readonly number[]; choices?: ValueChoices },
  snapshot: CsvSnapshot,
): CsvPlan {
  const { table, parsed, mapping } = input;
  checkMapping(table, parsed.headers, mapping);
  const fields = new Map(CSV_FIELDS[table].map((field) => [field.key, field]));
  const columns = mapping
    .map((key, column) => (key ? { column, field: fields.get(key)! } : null))
    .filter((entry): entry is { column: number; field: CsvField } => entry !== null);
  const include = new Set(input.include ?? []);
  const lookups = valueLookups(snapshot);
  const choices = input.choices ?? {};
  /** field → comparable value → what the plan lists about it. */
  const unknown = new Map<ValueField, Map<string, CsvUnknownValue & { lines: Set<number> }>>();
  const existing = emptyIndexes();
  for (const record of snapshot.records) index(existing, record, { id: record.id, email: record.email, website: record.website });
  const inFile = emptyIndexes();
  const lineOf = new Map<string, number>();

  const rows = parsed.rows.map((row): CsvPlanRow => {
    const errors: string[] = [];
    const warnings: string[] = [];
    const body: Record<string, unknown> = {};
    let recordId: string | null = null;
    const nameColumn = columns.find((entry) => entry.field.key === "name");
    const name = nameColumn ? row.cells[nameColumn.column]! : "";
    if (row.extraCells) errors.push("This row has more cells than the header has columns.");
    // Always sent, even empty: the detail page's rule then says "Name is required.".
    body.name = name;

    for (const { column, field } of columns) {
      const value = row.cells[column]!;
      if (value === "") continue;
      const fail = (message: string) => errors.push(`${field.label}: ${message}`);
      /** One value of a value field: its id, or null (left out, with a warning) when unknown and not mapped. */
      const resolve = (key: ValueField, item: string): string | null => {
        const lookup = lookups[key];
        const found = lookup.find(item);
        if (found.length === 1) return found[0]!;
        const comparableItem = comparable(item);
        const listed = unknown.get(key) ?? new Map();
        unknown.set(key, listed);
        const entry = listed.get(comparableItem) ?? {
          value: item,
          key: comparableItem,
          rows: 0,
          problem: found.length > 1 ? "several" : "unknown",
          lines: new Set<number>(),
        };
        entry.lines.add(row.line);
        entry.rows = entry.lines.size;
        listed.set(comparableItem, entry);
        const choice = choices[key]?.[comparableItem];
        if (choice !== undefined) entry.choice = choice;
        if (choice && lookup.options.some((option) => option.id === choice)) return choice;
        if (choice === null) warnings.push(`${field.label}: "${item}" skipped.`);
        else if (found.length > 1) warnings.push(`${field.label}: several are named "${item}"; imported without it.`);
        else warnings.push(`${field.label}: no ${WHAT[key]} named "${item}"; imported without it.`);
        return null;
      };
      const known = (key: ValueField) => (candidate: string) =>
        lookups[key].find(candidate).length === 1 || choices[key]?.[comparable(candidate)] !== undefined;
      const many = (key: ValueField) => {
        const ids: string[] = [];
        for (const item of splitNames(value, known(key))) {
          const id = resolve(key, item);
          if (id && !ids.includes(id)) ids.push(id);
        }
        return ids;
      };
      switch (field.key) {
        case "state":
        case "source": {
          const key = resolve(field.key, withoutNotionLink(value));
          if (key) body[`${field.key}Key`] = key;
          break;
        }
        case "contactChannels":
          body.contactChannelKeys = many("contactChannels");
          break;
        case "organizations":
          body.organizationIds = many("organizations");
          break;
        case "expertise":
          body.expertiseIds = many("expertise");
          break;
        case "doNotContact": {
          const flag = parseBoolean(value);
          if (flag === null) fail("use yes or no.");
          else body.doNotContact = flag;
          break;
        }
        case "relevanceScore":
          if (!/^\d+$/.test(value)) fail("use a whole number from 0 to 10.");
          else body.relevanceScore = Number(value);
          break;
        case "firstContactOn":
        case "lastContactOn": {
          const date = parseDate(value);
          if (!date) fail("use a date like 2026-10-30.");
          else body[field.key] = date;
          break;
        }
        case "nextFollowupAt": {
          const date = parseDate(value);
          const instant = date ? followUpInstant(date) : parseInstant(value);
          if (!instant) fail("use a date like 2026-10-30, or a date and time like 2026-10-30T09:00:00+01:00.");
          else body.nextFollowupAt = instant;
          break;
        }
        case "id":
          // Display numbers are not identities: never compared, never stored.
          if (DISPLAY_NUMBER.test(value)) break;
          if (!UUID.test(value)) fail("use the record's UUID (PER-, ORG- and GE- numbers aren't used).");
          else recordId = value;
          break;
        default:
          body[field.key] = value;
      }
    }

    // The detail page's own rules: required name, email and link formats, lengths, scores, relation limits.
    if (errors.length === 0) {
      const checked = SCHEMA[table].safeParse(body);
      if (!checked.success) {
        for (const issue of checked.error.issues) {
          const key = String(issue.path[0] ?? "");
          const label = fields.get(REQUEST_FIELD[key] ?? key)?.label;
          errors.push(label && !issue.message.startsWith(label) ? `${label}: ${issue.message}` : issue.message);
        }
      } else {
        Object.assign(body, checked.data);
      }
    }
    if (errors.length > 0) return { line: row.line, name, status: "error", errors, warnings, duplicate: null, included: false, request: null };

    const keys = {
      id: recordId,
      email: (body.email as string | null | undefined) ?? null,
      website: (body.website as string | null | undefined) ?? null,
      name: String(body.name),
    };
    const known = findDuplicate(existing, keys);
    const earlier = known ? null : findDuplicate(inFile, keys);
    const duplicate: CsvDuplicate | null = known
      ? { reason: `Same ${known.what} as ${known.ref.name}`, existing: known.ref, line: null }
      : earlier
        ? { reason: `Same ${earlier.what} as row ${lineOf.get(earlier.ref.id)}`, existing: null, line: lineOf.get(earlier.ref.id)! }
        : null;
    const rowRef = { id: `row:${row.line}`, name: keys.name };
    lineOf.set(rowRef.id, row.line);
    index(inFile, rowRef, { id: recordId, email: keys.email, website: keys.website });
    const included = duplicate !== null && include.has(row.line);
    return { line: row.line, name, status: duplicate && !included ? "duplicate" : "create", errors: [], warnings, duplicate, included, request: body };
  });

  const listed = VALUE_FIELDS.flatMap((key): CsvUnknownField[] => {
    const values = unknown.get(key);
    if (!values) return [];
    return [
      {
        field: key,
        label: fields.get(key)!.label,
        values: [...values.values()]
          .map(({ value, key, rows, problem, choice }) => ({ value, key, rows, problem, ...(choice !== undefined ? { choice } : {}) }))
          .sort((a, b) => b.rows - a.rows || a.value.localeCompare(b.value)),
        options: lookups[key].options,
      },
    ];
  });
  return { table, fileName: input.fileName, mapping: [...mapping], rows, unknown: listed };
}

export interface CsvCounts {
  fileName: string;
  rows: number;
  /** Rows that will be (or were) created, possible duplicates included by the admin counted in. */
  create: number;
  /** Possible duplicates skipped. */
  duplicates: number;
  /** Possible duplicates imported anyway. */
  duplicatesIncluded: number;
  errors: number;
  /** Rows imported (or to import) with a value left out (OPS-153). */
  warnings: number;
}

export function csvCounts(plan: CsvPlan): CsvCounts {
  const count = (test: (row: CsvPlanRow) => boolean) => plan.rows.filter(test).length;
  return {
    fileName: plan.fileName,
    rows: plan.rows.length,
    create: count((row) => row.status === "create"),
    duplicates: count((row) => row.status === "duplicate"),
    duplicatesIncluded: count((row) => row.included),
    errors: count((row) => row.status === "error"),
    warnings: count((row) => row.status !== "error" && row.warnings.length > 0),
  };
}
