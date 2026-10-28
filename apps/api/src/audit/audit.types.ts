/** Shapes shared by the audit log, the record history feed and the History page. */

/** Who made a change: a signed-in admin, or the platform itself (imports, Stripe, jobs) — "Automation". */
export type AuditActor = { type: "admin"; id: string; label: string; role: string } | { type: "automation"; label: "Automation" };

export const AUTOMATION: AuditActor = { type: "automation", label: "Automation" };

export type AuditSource = "admin" | "import" | "stripe" | "system";

export type AuditAction =
  | "created"
  | "imported"
  | "duplicated"
  | "updated"
  | "archived"
  | "restored"
  | "deleted"
  | "comment_added"
  | "comment_edited"
  | "comment_deleted"
  // Access grants, shown on the person, the account and the service (2026-10-28).
  | "access_granted"
  | "access_changed"
  | "access_revoked"
  // Accounts.
  | "invited"
  | "activated"
  | "link_created"
  | "password_changed"
  | "email_changed"
  | "deactivated"
  | "reactivated"
  | "permission_denied";

/** How a field's value is shown in the history (old struck through → new). */
export type FieldKind = "text" | "email" | "url" | "number" | "date" | "datetime" | "boolean" | "select" | "relation";

/**
 * Field privacy (config, enforced by the API): `contact` values are masked
 * (s•••@example.org) for roles without contact access; `private_note`
 * values are never returned in the history, to anyone.
 */
export type FieldPrivacy = "contact" | "private_note";

export interface RelationValue {
  id: string;
  label: string;
}
export interface SelectValue {
  key: string;
  label: string;
}
export type ScalarValue = string | number | boolean | null;
export type FieldValue = ScalarValue | SelectValue | RelationValue[];

/** One changed field of an "updated" event, as stored in audit_events.changes. */
export interface AuditChange {
  field: string;
  label: string;
  kind: FieldKind;
  privacy?: FieldPrivacy;
  before: FieldValue;
  after: FieldValue;
}

export interface AuditEventInput {
  entityType: string;
  entityId: string;
  action: AuditAction;
  actor: AuditActor;
  source: AuditSource;
  changes?: AuditChange[];
  /** Context: the record's label at the time (`label`), import source, duplicated-from record, comment text. */
  meta?: Record<string, unknown>;
}
