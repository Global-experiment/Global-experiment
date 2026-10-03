import type { Person, PersonInput } from "../api/types";
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
  otherContact: string;
  /** yyyy-mm-dd (UTC date) or "" */
  lastFollowupDate: string;
  organizations: RelationOption[];
  expertise: RelationOption[];
}

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
    otherContact: person.otherContact ?? "",
    lastFollowupDate: person.lastFollowupAt ? person.lastFollowupAt.slice(0, 10) : "",
    organizations: person.organizations.map((organization) => ({ id: organization.id, label: organization.name })),
    expertise: person.expertise.map((item) => ({ id: item.id, label: item.name, detail: `${item.field.name} · ${item.domain.name}` })),
  };
}

const TEXT_FIELDS = ["personalNote", "email", "phone", "website", "linkedin", "x", "otherContact"] as const;
const sameIds = (a: RelationOption[], b: RelationOption[]) =>
  a.length === b.length && a.every((option) => b.some((other) => other.id === option.id));

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
  if (draft.lastFollowupDate !== original.lastFollowupDate) {
    patch.lastFollowupAt = draft.lastFollowupDate ? `${draft.lastFollowupDate}T00:00:00.000Z` : null;
  }
  if (!sameIds(draft.organizations, original.organizations)) patch.organizationIds = draft.organizations.map((option) => option.id);
  if (!sameIds(draft.expertise, original.expertise)) patch.expertiseIds = draft.expertise.map((option) => option.id);
  return patch;
}

export const hasChanges = (patch: PersonInput) => Object.keys(patch).length > 0;
