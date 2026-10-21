import { entryLabel, personLabel } from "../audit/entity-labels.js";
import type { FieldSpec } from "../audit/record-fields.js";
import type { PersonDto } from "./people.contracts.js";

/**
 * The person fields the history records, in the record's order (person-record
 * prototype, Figma p14). Contact details are `contact` (masked in the history
 * unless the viewer's role may read them); the personal note is a private
 * note — its text is never returned in the history.
 */
export const PERSON_FIELDS: readonly FieldSpec<PersonDto>[] = [
  { field: "name", label: "Name", kind: "text", get: (p) => p.name },
  { field: "expertise", label: "Expertise", kind: "relation", get: (p) => p.expertise.map((item) => ({ id: item.id, label: item.name })) },
  { field: "personalNote", label: "Personal note", kind: "text", privacy: "private_note", get: (p) => p.personalNote },
  { field: "source", label: "Source", kind: "select", get: (p) => p.source },
  { field: "state", label: "State", kind: "select", get: (p) => p.state },
  { field: "email", label: "Email", kind: "email", privacy: "contact", get: (p) => p.email },
  { field: "phone", label: "Phone", kind: "text", privacy: "contact", get: (p) => p.phone },
  { field: "website", label: "Website", kind: "url", get: (p) => p.website },
  { field: "x", label: "X", kind: "url", get: (p) => p.x },
  { field: "linkedin", label: "LinkedIn", kind: "url", get: (p) => p.linkedin },
  { field: "otherSocials", label: "Other socials", kind: "url", get: (p) => p.otherSocials },
  { field: "otherContact", label: "Other contact details", kind: "text", privacy: "contact", get: (p) => p.otherContact },
  { field: "contactChannels", label: "Contact channels", kind: "relation", get: (p) => p.contactChannels.map((channel) => ({ id: channel.key, label: channel.label })) },
  { field: "doNotContact", label: "Do not contact", kind: "boolean", get: (p) => p.doNotContact },
  { field: "aiRelevanceScore", label: "AI relevance score", kind: "number", get: (p) => p.aiRelevanceScore },
  { field: "relevanceScore", label: "Relevance score", kind: "number", get: (p) => p.relevanceScore },
  { field: "organizations", label: "Organizations", kind: "relation", get: (p) => p.organizations.map((org) => ({ id: org.id, label: org.name })) },
  { field: "expenses", label: "Expenses", kind: "relation", get: (p) => p.expenses.map((expense) => ({ id: expense.id, label: entryLabel(expense) })) },
  { field: "firstContactOn", label: "First contact", kind: "date", get: (p) => p.firstContactOn },
  { field: "lastContactOn", label: "Last contact", kind: "date", get: (p) => p.lastContactOn },
  { field: "nextFollowupAt", label: "Follow-up date", kind: "datetime", get: (p) => p.nextFollowupAt },
  { field: "wiseRecipientId", label: "Wise recipient ID", kind: "text", privacy: "contact", get: (p) => p.wiseRecipientId },
];

export const labelOfPerson = (person: Pick<PersonDto, "personNumber" | "name">) => personLabel(person);
