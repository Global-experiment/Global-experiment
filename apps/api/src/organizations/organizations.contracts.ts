import { z } from "zod";
import { listQuerySchema } from "../common/listing/list-query.js";
import { LIMIT_MESSAGES, RELATION_LIMITS } from "../common/relation-limits.js";
import { INVALID_LINK, isWebLink } from "../common/web-link.js";
import type { EntityRef, ExpertiseRef } from "../people/people.contracts.js";

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

const organizationFields = {
  name: z.string().trim().min(1, "Name is required.").max(200),
  description: optionalText(5000),
  website: optionalLink(2048),
  email: z
    .string()
    .max(320)
    .transform((value) => value.trim() || null)
    .pipe(z.email("Invalid email address.").nullable())
    .nullable()
    .optional(),
  /** Free text: no Wise ID format is assumed (data-model.md §3). */
  wiseRecipientId: optionalText(100),
  expertiseIds: z
    .array(z.uuid())
    .max(RELATION_LIMITS.expertise, LIMIT_MESSAGES.organizationExpertise)
    .refine((ids) => new Set(ids).size === ids.length, "Duplicate ids.")
    .optional(),
};

export const CreateOrganizationRequest = z.strictObject(organizationFields);
export type CreateOrganizationRequest = z.output<typeof CreateOrganizationRequest>;

export const UpdateOrganizationRequest = z
  .strictObject({
    ...organizationFields,
    name: organizationFields.name.optional(),
    /** The organization's people, all at once (one Submit = one event); each person keeps the 5-organization cap. */
    personIds: z
      .array(z.uuid())
      .max(500)
      .refine((ids) => new Set(ids).size === ids.length, "Duplicate ids.")
      .optional(),
  })
  .refine((body) => Object.keys(body).length > 0, "Nothing to update.");
export type UpdateOrganizationRequest = z.output<typeof UpdateOrganizationRequest>;

export const ORGANIZATION_SORT_FIELDS = ["number", "name", "people", "created", "updated"] as const;
export type OrganizationSortField = (typeof ORGANIZATION_SORT_FIELDS)[number];

export const OrganizationsListQuery = listQuerySchema({
  sortFields: ORGANIZATION_SORT_FIELDS,
  defaultSort: [{ field: "name", direction: "asc" }],
  filters: {
    name: { operators: ["contains", "not_contains"] },
    website: { operators: ["is_empty", "is_not_empty"] },
    description: { operators: ["contains", "is_empty", "is_not_empty"] },
    email: { operators: ["contains", "is_empty", "is_not_empty"] },
    expertise: { operators: ["is", "is_empty", "is_not_empty"], value: z.uuid() },
    person: { operators: ["is", "is_empty", "is_not_empty"], value: z.uuid() },
    completeness: { operators: ["is"], value: z.enum(["complete", "incomplete"]) },
    /** The "Archived" view (decision 12): without this filter, archived organizations are left out. */
    archived: { operators: ["is"], value: z.enum(["true", "false"]).transform((value) => value === "true") },
  },
});
export type OrganizationsListQuery = z.output<typeof OrganizationsListQuery>;

/** What an organization needs to be complete (the client's required-for-completeness fields). */
export const ORGANIZATION_COMPLETENESS = ["Description", "Website", "Email", "Wise recipient ID", "Expertise"] as const;
export type OrganizationCompletenessField = (typeof ORGANIZATION_COMPLETENESS)[number];

export interface OrganizationDto {
  /** Completeness fields that are empty (see ORGANIZATION_COMPLETENESS). */
  missing: OrganizationCompletenessField[];
  id: string;
  /** Organization ID: shown as `ORG-${orgNumber}`. */
  orgNumber: number;
  /** The Notion page this organization was imported from (read-only). */
  notionPageId: string | null;
  name: string;
  description: string | null;
  website: string | null;
  email: string | null;
  wiseRecipientId: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  people: EntityRef[];
  expertise: ExpertiseRef[];
}

/** Permanent delete (directory.delete, decision 12): the organization's name typed exactly. */
export const DeleteOrganizationRequest = z.strictObject({ confirm: z.string().max(200) });
export type DeleteOrganizationRequest = z.output<typeof DeleteOrganizationRequest>;
