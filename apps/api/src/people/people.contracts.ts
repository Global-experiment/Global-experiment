import { z } from "zod";
import type { GrantRef } from "../services/services.contracts.js";
import { listQuerySchema } from "../common/listing/list-query.js";
import { LIMIT_MESSAGES, RELATION_LIMITS } from "../common/relation-limits.js";
import { INVALID_LINK, isWebLink } from "../common/web-link.js";

/** Request contracts (validated) and response shapes (stable JSON) for /api/admin/people. */

const vocabularyKey = z.string().regex(/^[a-z][a-z0-9_]{0,39}$/, "Unknown value.");

/** Trimmed optional text: "" and whitespace-only become null (clears the field). */
const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .transform((value) => value.trim() || null)
    .nullable()
    .optional();

/** A link field: trimmed, "" clears it, otherwise a valid web address (web-link.ts). */
const optionalLink = (max: number) =>
  z
    .string()
    .max(max)
    .transform((value) => value.trim() || null)
    .refine((value) => value === null || isWebLink(value), INVALID_LINK)
    .nullable()
    .optional();

const uniqueIds = (max: number, message: string) =>
  z
    .array(z.uuid())
    .max(max, message)
    .refine((ids) => new Set(ids).size === ids.length, "Duplicate ids.");

const personFields = {
  name: z.string().trim().min(1, "Name is required.").max(200),
  stateKey: vocabularyKey.nullable().optional(),
  sourceKey: vocabularyKey.nullable().optional(),
  description: optionalText(5000),
  doNotContact: z.boolean().optional(),
  email: z
    .string()
    .max(320)
    .transform((value) => value.trim() || null)
    .pipe(z.email("Invalid email address.").nullable())
    .nullable()
    .optional(),
  phone: optionalText(64),
  website: optionalLink(2048),
  linkedin: optionalLink(2048),
  x: optionalLink(2048),
  otherContact: optionalText(500),
  /** Free text: no Wise ID format is assumed (data-model.md §2). */
  wiseRecipientId: optionalText(100),
  /** Next planned follow-up: an instant (ISO 8601 with offset), shown in the viewer's time zone. */
  nextFollowupAt: z.iso.datetime({ offset: true }).nullable().optional(),
  /** First and last contact: calendar dates (YYYY-MM-DD), never converted. */
  firstContactOn: z.iso.date().nullable().optional(),
  lastContactOn: z.iso.date().nullable().optional(),
  /** Whole scores 0–10 (decision 7); the AI score is refused while ai.enabled is on. */
  aiRelevanceScore: z.number().int("Use a whole number from 0 to 10.").min(0, "Use a whole number from 0 to 10.").max(10, "Use a whole number from 0 to 10.").nullable().optional(),
  relevanceScore: z.number().int("Use a whole number from 0 to 10.").min(0, "Use a whole number from 0 to 10.").max(10, "Use a whole number from 0 to 10.").nullable().optional(),
  otherSocials: optionalLink(2048),
  /** The channels this person can be reached on (contact_channels keys). */
  contactChannelKeys: z.array(vocabularyKey).max(20).refine((keys) => new Set(keys).size === keys.length, "Duplicate channels.").optional(),
  /** Expenses paid to this person (Treasury expenses; sets their recipient). */
  expenseIds: uniqueIds(50, "At most 50 expenses.").optional(),
  organizationIds: uniqueIds(RELATION_LIMITS.organizationsPerPerson, LIMIT_MESSAGES.personOrganizations).optional(),
  expertiseIds: uniqueIds(RELATION_LIMITS.expertise, LIMIT_MESSAGES.personExpertise).optional(),
};

export const CreatePersonRequest = z.strictObject(personFields);
export type CreatePersonRequest = z.output<typeof CreatePersonRequest>;

export const UpdatePersonRequest = z
  .strictObject({ ...personFields, name: personFields.name.optional() })
  .refine((body) => Object.keys(body).length > 0, "Nothing to update.");
export type UpdatePersonRequest = z.output<typeof UpdatePersonRequest>;

export const PEOPLE_SORT_FIELDS = ["number", "name", "state", "source", "created", "updated", "next_followup"] as const;
export type PeopleSortField = (typeof PEOPLE_SORT_FIELDS)[number];

export const PeopleListQuery = listQuerySchema({
  sortFields: PEOPLE_SORT_FIELDS,
  defaultSort: [{ field: "created", direction: "desc" }],
  filters: {
    state: { operators: ["is", "is_not", "is_empty", "is_not_empty"], value: vocabularyKey },
    source: { operators: ["is", "is_not", "is_empty", "is_not_empty"], value: vocabularyKey },
    name: { operators: ["contains", "not_contains"] },
    description: { operators: ["contains", "not_contains", "is_empty", "is_not_empty"] },
    email: { operators: ["contains", "is_empty", "is_not_empty"] },
    organization: { operators: ["is", "is_empty", "is_not_empty"], value: z.uuid() },
    expertise: { operators: ["is", "is_empty", "is_not_empty"], value: z.uuid() },
    /** Expertise rollup: people with any expertise in this field / domain. */
    expertise_field: { operators: ["is"], value: z.uuid() },
    expertise_domain: { operators: ["is"], value: z.uuid() },
    /** Overdue: next follow-up already passed, not Rejected, not Do not contact. */
    follow_up: { operators: ["is"], value: z.enum(["overdue"]) },
    completeness: { operators: ["is"], value: z.enum(["complete", "incomplete"]) },
    do_not_contact: {
      operators: ["is"],
      value: z.enum(["true", "false"]).transform((value) => value === "true"),
    },
    /** The "Archived" view (decision 12): without this filter, archived people are left out. */
    archived: {
      operators: ["is"],
      value: z.enum(["true", "false"]).transform((value) => value === "true"),
    },
  },
});
export type PeopleListQuery = z.output<typeof PeopleListQuery>;
export type PeopleFilterField = PeopleListQuery["filters"][number]["field"];

/** What a person needs to be complete (the client's required-for-completeness fields). */
export const PERSON_COMPLETENESS = ["State", "Source", "Description", "Expertise"] as const;
export type PersonCompletenessField = (typeof PERSON_COMPLETENESS)[number];

export interface VocabularyEntry {
  key: string;
  label: string;
}

export interface EntityRef {
  id: string;
  name: string;
}

export interface ExpertiseRef extends EntityRef {
  stableId: string | null;
  status: VocabularyEntry | null;
  field: EntityRef;
  domain: EntityRef;
}

export interface PersonDto {
  id: string;
  /** Person ID: shown as `PER-${personNumber}`. */
  personNumber: number;
  /** The Notion page this person was imported from (read-only). */
  notionPageId: string | null;
  name: string;
  state: VocabularyEntry | null;
  source: VocabularyEntry | null;
  description: string | null;
  doNotContact: boolean;
  email: string | null;
  phone: string | null;
  website: string | null;
  linkedin: string | null;
  x: string | null;
  otherContact: string | null;
  wiseRecipientId: string | null;
  nextFollowupAt: string | null;
  firstContactOn: string | null;
  lastContactOn: string | null;
  aiRelevanceScore: number | null;
  relevanceScore: number | null;
  otherSocials: string | null;
  contactChannels: VocabularyEntry[];
  /** Expenses paid to this person (their recipient). */
  expenses: ExpenseRef[];
  /** Their access grants (Permissions, Figma p14): "GitHub · admin" chips. */
  permissions: GrantRef[];
  /** The former "last follow-up" value, kept as-is (read-only). */
  lastFollowupAtLegacy: string | null;
  /** The next follow-up has passed, and the person is neither Rejected nor Do not contact. */
  followUpOverdue: boolean;
  archivedAt: string | null;
  /** Completeness fields that are empty (see PERSON_COMPLETENESS). */
  missing: PersonCompletenessField[];
  createdAt: string;
  updatedAt: string;
  organizations: EntityRef[];
  expertise: ExpertiseRef[];
}

export interface ExpenseRef {
  id: string;
  /** EXP-n */
  entryNumber: number;
  currency: string;
  /** Minor units. */
  grossAmount: number;
}

export interface PeopleOptionsDto {
  states: VocabularyEntry[];
  sources: VocabularyEntry[];
  contactChannels: VocabularyEntry[];
  /** ai.enabled: the AI relevance score is read-only. */
  aiScoreReadOnly: boolean;
}

/** Permanent delete (directory.delete, decision 12): the person's name typed exactly. */
export const DeletePersonRequest = z.strictObject({ confirm: z.string().max(200) });
export type DeletePersonRequest = z.output<typeof DeletePersonRequest>;
