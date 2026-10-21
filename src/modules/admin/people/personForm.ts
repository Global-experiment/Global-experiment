import { formatMoney } from "@/shared/format/numbers";
import type { ExpenseRef, Person, PersonInput } from "../api/types";
import { linkedExpertiseOption } from "../expertise/expertiseOptions";
import type { RelationOption } from "../ui/RelationPicker";

/** Editable state of a person record (strings as typed; relations as picker options). */
export interface PersonDraft {
  name: string;
  stateKey: string;
  sourceKey: string;
  personalNote: string;
  doNotContact: boolean;
  email: string;
  phone: string;
  website: string;
  linkedin: string;
  x: string;
  otherSocials: string;
  otherContact: string;
  wiseRecipientId: string;
  /** Next follow-up in the viewer's time zone, as a datetime-local value ("2026-10-14T09:30") or "". */
  nextFollowupAt: string;
  /** Calendar dates, yyyy-mm-dd or "". */
  firstContactOn: string;
  lastContactOn: string;
  /** Scores as typed ("" = not set). */
  aiRelevanceScore: string;
  relevanceScore: string;
  contactChannelKeys: string[];
  organizations: RelationOption[];
  expertise: RelationOption[];
  expenses: RelationOption[];
}

const pad = (n: number) => String(n).padStart(2, "0");

/** An instant → the value of an <input type="datetime-local"> in the browser's time zone. */
export function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** The datetime-local value (the viewer's time zone) → an instant, or null. */
export function fromLocalInput(local: string): string | null {
  if (!local) return null;
  const date = new Date(local);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** "EXP-12 · −USD 200.00", the expense chip of the person record. */
export const expenseOption = (expense: ExpenseRef): RelationOption => ({
  id: expense.id,
  label: `EXP-${expense.entryNumber} · ${formatMoney(expense.grossAmount, expense.currency)}`,
  href: `/admin/treasury/${expense.id}`,
});

export function draftFromPerson(person: Person): PersonDraft {
  return {
    name: person.name,
    stateKey: person.state?.key ?? "",
    sourceKey: person.source?.key ?? "",
    personalNote: person.personalNote ?? "",
    doNotContact: person.doNotContact,
    email: person.email ?? "",
    phone: person.phone ?? "",
    website: person.website ?? "",
    linkedin: person.linkedin ?? "",
    x: person.x ?? "",
    otherSocials: person.otherSocials ?? "",
    otherContact: person.otherContact ?? "",
    wiseRecipientId: person.wiseRecipientId ?? "",
    nextFollowupAt: toLocalInput(person.nextFollowupAt),
    firstContactOn: person.firstContactOn ?? "",
    lastContactOn: person.lastContactOn ?? "",
    aiRelevanceScore: person.aiRelevanceScore === null ? "" : String(person.aiRelevanceScore),
    relevanceScore: person.relevanceScore === null ? "" : String(person.relevanceScore),
    contactChannelKeys: person.contactChannels.map((channel) => channel.key),
    organizations: person.organizations.map((organization) => ({ id: organization.id, label: organization.name, href: `/admin/organizations/${organization.id}` })),
    expertise: person.expertise.map(linkedExpertiseOption),
    expenses: person.expenses.map(expenseOption),
  };
}

const TEXT_FIELDS = ["personalNote", "email", "phone", "website", "linkedin", "x", "otherSocials", "otherContact", "wiseRecipientId"] as const;
const sameIds = (a: RelationOption[], b: RelationOption[]) => a.length === b.length && a.every((option) => b.some((other) => other.id === option.id));
const sameKeys = (a: string[], b: string[]) => a.length === b.length && a.every((key) => b.includes(key));

/** A score as typed: a whole number from 0 to 10, or empty. */
const SCORE = /^(?:[0-9]|10)$/;
export const SCORE_MESSAGE = "Use a whole number from 0 to 10.";

/** Field errors found before sending (the API checks the same rules). */
export function personDraftErrors(draft: PersonDraft): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!draft.name.trim()) errors.name = "Name is required.";
  for (const field of ["aiRelevanceScore", "relevanceScore"] as const) {
    if (draft[field].trim() && !SCORE.test(draft[field].trim())) errors[field] = SCORE_MESSAGE;
  }
  if (draft.firstContactOn && draft.lastContactOn && draft.firstContactOn > draft.lastContactOn) errors.lastContactOn = "The last contact can't be before the first contact.";
  return errors;
}

const score = (text: string) => (text.trim() === "" ? null : Number(text.trim()));

/**
 * The PATCH body for what changed — nothing else is sent, so a concurrent
 * edit to an untouched field isn't overwritten. Blank text clears a field.
 */
export function personPatch(original: PersonDraft, draft: PersonDraft): PersonInput {
  const patch: PersonInput = {};
  if (draft.name.trim() !== original.name.trim()) patch.name = draft.name;
  if (draft.stateKey !== original.stateKey) patch.stateKey = draft.stateKey || null;
  if (draft.sourceKey !== original.sourceKey) patch.sourceKey = draft.sourceKey || null;
  if (draft.doNotContact !== original.doNotContact) patch.doNotContact = draft.doNotContact;
  for (const field of TEXT_FIELDS) {
    if (draft[field].trim() !== original[field].trim()) patch[field] = draft[field].trim() || null;
  }
  if (draft.nextFollowupAt !== original.nextFollowupAt) patch.nextFollowupAt = fromLocalInput(draft.nextFollowupAt);
  if (draft.firstContactOn !== original.firstContactOn) patch.firstContactOn = draft.firstContactOn || null;
  if (draft.lastContactOn !== original.lastContactOn) patch.lastContactOn = draft.lastContactOn || null;
  if (draft.aiRelevanceScore.trim() !== original.aiRelevanceScore.trim()) patch.aiRelevanceScore = score(draft.aiRelevanceScore);
  if (draft.relevanceScore.trim() !== original.relevanceScore.trim()) patch.relevanceScore = score(draft.relevanceScore);
  if (!sameKeys(draft.contactChannelKeys, original.contactChannelKeys)) patch.contactChannelKeys = draft.contactChannelKeys;
  if (!sameIds(draft.organizations, original.organizations)) patch.organizationIds = draft.organizations.map((option) => option.id);
  if (!sameIds(draft.expertise, original.expertise)) patch.expertiseIds = draft.expertise.map((option) => option.id);
  if (!sameIds(draft.expenses, original.expenses)) patch.expenseIds = draft.expenses.map((option) => option.id);
  return patch;
}

/** The POST body of a new person from a draft (Duplicate as a draft): every filled field. */
export function personCreateBody(draft: PersonDraft): PersonInput & { name: string } {
  const empty: PersonDraft = {
    ...draft,
    name: "",
    stateKey: "",
    sourceKey: "",
    personalNote: "",
    doNotContact: false,
    email: "",
    phone: "",
    website: "",
    linkedin: "",
    x: "",
    otherSocials: "",
    otherContact: "",
    wiseRecipientId: "",
    nextFollowupAt: "",
    firstContactOn: "",
    lastContactOn: "",
    aiRelevanceScore: "",
    relevanceScore: "",
    contactChannelKeys: [],
    organizations: [],
    expertise: [],
    // Expenses have one recipient: a copy never takes them over.
    expenses: [],
  };
  const body = personPatch(empty, { ...draft, expenses: [] });
  delete body.expenseIds;
  return { ...body, name: draft.name };
}

export const hasChanges = (patch: PersonInput) => Object.keys(patch).length > 0;
