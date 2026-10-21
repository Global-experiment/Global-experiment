import type { AuditChange, FieldKind, FieldPrivacy, FieldValue, RelationValue, SelectValue } from "./audit.types.js";

/**
 * One audited field of a record type: how to read it from the record's DTO,
 * how the history shows it, and its privacy class. Each module declares its
 * list (people.audit.ts, …); one "Submit changes" becomes one "updated"
 * event holding every field that differs.
 */
export interface FieldSpec<Dto> {
  field: string;
  label: string;
  kind: FieldKind;
  privacy?: FieldPrivacy;
  get: (record: Dto) => FieldValue;
}

const isRelationList = (value: FieldValue): value is RelationValue[] => Array.isArray(value);
const isSelect = (value: FieldValue): value is SelectValue => typeof value === "object" && value !== null && !Array.isArray(value) && "key" in value;

/** Values compared for "did it change": relations as sets of ids, selects by key, scalars as-is. */
function comparable(value: FieldValue): string {
  if (isRelationList(value)) return JSON.stringify(value.map((item) => item.id).sort());
  if (isSelect(value)) return `select:${value.key}`;
  return JSON.stringify(value ?? null);
}

/** Empty for history purposes: null, "", an empty relation list. */
export const isEmptyValue = (value: FieldValue) => value === null || value === "" || (Array.isArray(value) && value.length === 0);

/** The fields that differ between two versions of a record (one entry per field). */
export function diffRecord<Dto>(specs: readonly FieldSpec<Dto>[], before: Dto, after: Dto): AuditChange[] {
  const changes: AuditChange[] = [];
  for (const spec of specs) {
    const previous = spec.get(before);
    const next = spec.get(after);
    if (comparable(previous) === comparable(next)) continue;
    changes.push({
      field: spec.field,
      label: spec.label,
      kind: spec.kind,
      ...(spec.privacy ? { privacy: spec.privacy } : {}),
      before: previous ?? null,
      after: next ?? null,
    });
  }
  return changes;
}

export type FieldAccess = Readonly<Record<string, readonly FieldPrivacy[]>>;

/**
 * Which privacy classes each role may read IN THE HISTORY (config; enforced
 * by the API). As in the person-record prototype, contact details are
 * masked there for every role by default — the record itself shows the
 * current values; add "contact" to a role to show it the values in the
 * history too. Private notes are never returned in the history, whatever
 * this says.
 */
export const HISTORY_FIELD_ACCESS: FieldAccess = {
  owner: [],
  admin: [],
  viewer: [],
};

export const canRead = (role: string, privacy: FieldPrivacy | undefined, access: FieldAccess = HISTORY_FIELD_ACCESS) =>
  privacy === undefined || (privacy !== "private_note" && (access[role] ?? []).includes(privacy));

/** "stanley@example.org" → "s•••@example.org"; other values keep their first character: "+41 79…" → "+•••". */
export function maskText(value: string): string {
  const at = value.indexOf("@");
  if (at > 0) return `${value[0]}•••${value.slice(at)}`;
  return value.length > 0 ? `${value[0]}•••` : value;
}

function maskValue(value: FieldValue): FieldValue {
  if (typeof value === "string") return maskText(value);
  if (isRelationList(value)) return value.map((item) => ({ ...item, label: maskText(item.label) }));
  if (isSelect(value)) return { ...value, label: maskText(value.label) };
  return value;
}

/** A change as a viewer with `role` may see it: masked contact values, private notes never shown. */
export interface VisibleChange extends AuditChange {
  masked?: true;
  redacted?: true;
}

export function visibleChanges(changes: readonly AuditChange[], role: string, access: FieldAccess = HISTORY_FIELD_ACCESS): VisibleChange[] {
  return changes.map((change) => {
    if (change.privacy === "private_note") return { ...change, before: null, after: null, redacted: true };
    if (change.privacy && !canRead(role, change.privacy, access)) return { ...change, before: maskValue(change.before), after: maskValue(change.after), masked: true };
    return change;
  });
}
