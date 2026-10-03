import { z } from "zod";
import { listQuerySchema } from "../common/listing/list-query.js";

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

const uniqueIds = z
  .array(z.uuid())
  .max(100)
  .refine((ids) => new Set(ids).size === ids.length, "Duplicate ids.");

const personFields = {
  name: z.string().trim().min(1, "Name is required.").max(200),
  stateKey: vocabularyKey.nullable().optional(),
  sourceKey: vocabularyKey.nullable().optional(),
  personalNote: optionalText(5000),
  doNotContact: z.boolean().optional(),
  email: z
    .string()
    .max(320)
    .transform((value) => value.trim() || null)
    .pipe(z.email("Invalid email address.").nullable())
    .nullable()
    .optional(),
  phone: optionalText(64),
  website: optionalText(2048),
  linkedin: optionalText(2048),
  x: optionalText(2048),
  otherContact: optionalText(500),
  lastFollowupAt: z.iso.datetime({ offset: true }).nullable().optional(),
  organizationIds: uniqueIds.optional(),
  expertiseIds: uniqueIds.optional(),
};

export const CreatePersonRequest = z.strictObject(personFields);
export type CreatePersonRequest = z.output<typeof CreatePersonRequest>;

export const UpdatePersonRequest = z
  .strictObject({ ...personFields, name: personFields.name.optional() })
  .refine((body) => Object.keys(body).length > 0, "Nothing to update.");
export type UpdatePersonRequest = z.output<typeof UpdatePersonRequest>;

export const PEOPLE_SORT_FIELDS = ["name", "state", "source", "created", "updated", "last_followup"] as const;
export type PeopleSortField = (typeof PEOPLE_SORT_FIELDS)[number];

export const PeopleListQuery = listQuerySchema({
  sortFields: PEOPLE_SORT_FIELDS,
  defaultSort: [{ field: "created", direction: "desc" }],
  filters: {
    state: { operators: ["is", "is_not", "is_empty", "is_not_empty"], value: vocabularyKey },
    source: { operators: ["is", "is_not", "is_empty", "is_not_empty"], value: vocabularyKey },
    name: { operators: ["contains", "not_contains"] },
    personal_note: { operators: ["contains", "not_contains", "is_empty", "is_not_empty"] },
    email: { operators: ["contains", "is_empty", "is_not_empty"] },
    organization: { operators: ["is", "is_empty", "is_not_empty"], value: z.uuid() },
    expertise: { operators: ["is", "is_empty", "is_not_empty"], value: z.uuid() },
    do_not_contact: {
      operators: ["is"],
      value: z.enum(["true", "false"]).transform((value) => value === "true"),
    },
  },
});
export type PeopleListQuery = z.output<typeof PeopleListQuery>;
export type PeopleFilterField = PeopleListQuery["filters"][number]["field"];

export interface VocabularyEntry {
  key: string;
  label: string;
}

export interface EntityRef {
  id: string;
  name: string;
}

export interface ExpertiseRef extends EntityRef {
  field: EntityRef;
  domain: EntityRef;
}

export interface PersonDto {
  id: string;
  name: string;
  state: VocabularyEntry | null;
  source: VocabularyEntry | null;
  personalNote: string | null;
  doNotContact: boolean;
  email: string | null;
  phone: string | null;
  website: string | null;
  linkedin: string | null;
  x: string | null;
  otherContact: string | null;
  lastFollowupAt: string | null;
  createdAt: string;
  updatedAt: string;
  organizations: EntityRef[];
  expertise: ExpertiseRef[];
}

export interface PeopleOptionsDto {
  states: VocabularyEntry[];
  sources: VocabularyEntry[];
}
