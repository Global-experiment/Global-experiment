import type { HistoryChange, HistoryItem, HistoryValue } from "../api/types";

/**
 * The words of the record history (person-record prototype, Figma p10/p14):
 * one headline per event — "updated 3 fields", "updated contact details",
 * "edited a note", "added a website", "cleared a field", "linked an
 * expense", "replaced a relation"… — computed from the event's structured
 * changes, so the API stays the single source of what changed.
 */

/** A relation field's singular, with its article, for "linked an expense". */
const SINGULAR: Record<string, string> = {
  expenses: "an expense",
  organizations: "an organization",
  expertise: "an expertise",
  contactChannels: "a contact channel",
  people: "a person",
  documents: "a document",
  recipient: "a recipient",
  permissions: "an access",
  contracts: "a contract",
};

const article = (word: string) => (/^[aeiou]/i.test(word) || word === "X" ? `an ${word}` : `a ${word}`);
/** A field label inside a sentence: lowercase, except names ("X", "LinkedIn"). */
const inSentence = (label: string) => (label === "X" || label === "LinkedIn" ? label : label.toLowerCase());

export const isEmptyValue = (value: HistoryValue) => value === null || value === "" || (Array.isArray(value) && value.length === 0);
const ids = (value: HistoryValue) => (Array.isArray(value) ? value.map((item) => item.id) : []);

/** Relation changes as removed and added items. */
export function relationDiff(change: HistoryChange) {
  const before = Array.isArray(change.before) ? change.before : [];
  const after = Array.isArray(change.after) ? change.after : [];
  const was = new Set(ids(before));
  const now = new Set(ids(after));
  return { removed: before.filter((item) => !now.has(item.id)), added: after.filter((item) => !was.has(item.id)) };
}

function updateHeadline(changes: HistoryChange[], entity: string): string {
  if (changes.length === 0) return "updated this record";
  if (changes.every((change) => change.privacy === "contact")) return "updated contact details";
  if (changes.length > 1) return `updated ${changes.length} fields`;
  const [change] = changes as [HistoryChange];
  if (change.privacy === "private_note") return "edited a note";
  if (change.field === "publication" && change.after && typeof change.after === "object" && "key" in change.after) {
    return change.after.key === "published" ? `published this ${entity}` : `unpublished this ${entity}`;
  }
  if (change.kind === "relation") {
    const { removed, added } = relationDiff(change);
    const noun = SINGULAR[change.field] ?? "a relation";
    if (added.length > 0 && removed.length > 0) return "replaced a relation";
    if (added.length === 1) return `linked ${noun}`;
    if (removed.length === 1) return `unlinked ${noun}`;
    if (removed.length === 0 && added.length === 0) return `reordered ${inSentence(change.label)}`;
    return `updated ${inSentence(change.label)}`;
  }
  if (isEmptyValue(change.before) && !isEmptyValue(change.after)) return `added ${article(inSentence(change.label))}`;
  if (!isEmptyValue(change.before) && isEmptyValue(change.after)) return "cleared a field";
  return `updated ${inSentence(change.label)}`;
}

/** The headline after the actor's name. `entity` names the record ("record", "entry"). */
export function historyHeadline(item: Pick<HistoryItem, "action" | "changes">, entity = "record"): string {
  switch (item.action) {
    case "created":
      return `created this ${entity}`;
    case "imported":
      return `imported this ${entity}`;
    case "duplicated":
      return `duplicated ${article(entity)}`;
    case "archived":
      return `archived this ${entity}`;
    case "restored":
      return `restored this ${entity}`;
    case "deleted":
      return `deleted this ${entity}`;
    case "comment_added":
      return "left a comment";
    case "comment_edited":
      return "edited a comment";
    case "comment_deleted":
      return "deleted a comment";
    case "viewed":
      return "viewed this page";
    case "updated":
      return updateHeadline(item.changes, entity);
    case "access_granted":
      return "granted access";
    case "access_changed":
      return "changed access";
    case "access_revoked":
      return "revoked access";
    case "invited":
      return `invited this ${entity}`;
    case "activated":
      return `activated this ${entity}`;
    case "link_created":
      return "created a one-time link";
    case "password_changed":
      return "changed the password";
    case "email_changed":
      return "changed the email";
    case "deactivated":
      return `deactivated this ${entity}`;
    case "reactivated":
      return `reactivated this ${entity}`;
    case "permission_denied":
      return "was refused an action";
  }
}

/** A URL as the history shows it: without the protocol and a trailing slash ("workana.com"). */
export const shortUrl = (url: string) => url.replace(/^https?:\/\//i, "").replace(/\/$/, "");

/** The private-note sentence (the text is never shown in the history). */
export const PRIVATE_NOTE_TEXT = ["Private note updated.", "Previous and new text available to authorized viewers."] as const;

/**
 * Monitoring → History names the record by its title (client, 2026-10-23:
 * "'Admin' did action on 'Entry title'"): the headline split around where
 * the title goes — "updated 3 fields on |Stanley Qiang|", "archived
 * |EXP-12 Hosting|", "commented on |…|".
 */
export function historyPageHeadline(item: Pick<HistoryItem, "action" | "changes">, entity = "record"): { before: string; after: string } {
  switch (item.action) {
    case "comment_added":
      return { before: "commented on", after: "" };
    case "comment_edited":
      return { before: "edited a comment on", after: "" };
    case "comment_deleted":
      return { before: "deleted a comment on", after: "" };
    case "viewed":
      return { before: "viewed", after: "" };
    case "duplicated":
      return { before: "created", after: "as a duplicate" };
    case "access_granted":
      return { before: "granted access on", after: "" };
    case "access_changed":
      return { before: "changed access on", after: "" };
    case "access_revoked":
      return { before: "revoked access on", after: "" };
    case "link_created":
      return { before: "created a one-time link for", after: "" };
    case "password_changed":
      return { before: "changed the password of", after: "" };
    case "email_changed":
      return { before: "changed the email of", after: "" };
    case "permission_denied":
      return { before: "was refused an action as", after: "" };
  }
  const headline = historyHeadline(item, entity);
  const marker = `this ${entity}`;
  const at = headline.indexOf(marker);
  if (at !== -1) return { before: headline.slice(0, at).trimEnd(), after: headline.slice(at + marker.length).trim() };
  return { before: `${headline} on`, after: "" };
}
