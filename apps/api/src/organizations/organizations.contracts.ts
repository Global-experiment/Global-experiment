import { z } from "zod";
import { listQuerySchema } from "../common/listing/list-query.js";
import type { EntityRef, ExpertiseRef } from "../people/people.contracts.js";

const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .transform((value) => value.trim() || null)
    .nullable()
    .optional();

const organizationFields = {
  name: z.string().trim().min(1, "Name is required.").max(200),
  description: optionalText(5000),
  website: optionalText(2048),
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
    .max(100)
    .refine((ids) => new Set(ids).size === ids.length, "Duplicate ids.")
    .optional(),
};

export const CreateOrganizationRequest = z.strictObject(organizationFields);
export type CreateOrganizationRequest = z.output<typeof CreateOrganizationRequest>;

export const UpdateOrganizationRequest = z
  .strictObject({ ...organizationFields, name: organizationFields.name.optional() })
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
  },
});
export type OrganizationsListQuery = z.output<typeof OrganizationsListQuery>;

export interface OrganizationDto {
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
  people: EntityRef[];
  expertise: ExpertiseRef[];
}
