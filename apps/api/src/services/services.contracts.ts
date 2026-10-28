import { z } from "zod";
import { listQuerySchema } from "../common/listing/list-query.js";
import { INVALID_LINK, isWebLink } from "../common/web-link.js";

/** Request contracts and response shapes for /api/admin/services and /api/admin/access-grants. */

const vocabularyKey = z.string().regex(/^[a-z][a-z0-9_]{0,39}$/, "Unknown value.");
const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .transform((value) => value.trim() || null)
    .nullable()
    .optional();
const optionalLink = z
  .string()
  .max(2048)
  .transform((value) => value.trim() || null)
  .refine((value) => value === null || isWebLink(value), INVALID_LINK)
  .nullable()
  .optional();
const optionalDay = z.iso.date().nullable().optional();

const serviceFields = {
  name: z.string().trim().min(1, "Name is required.").max(200),
  statusKey: vocabularyKey.nullable().optional(),
  categoryKey: vocabularyKey.nullable().optional(),
  hostingModelKey: vocabularyKey.nullable().optional(),
  url: optionalLink,
  description: optionalText(5000),
  /** Decision 5: an admin account. */
  responsibleAdminId: z.uuid().nullable().optional(),
};

export const CreateServiceRequest = z.strictObject(serviceFields);
export type CreateServiceRequest = z.output<typeof CreateServiceRequest>;
export const UpdateServiceRequest = z
  .strictObject({ ...serviceFields, name: serviceFields.name.optional() })
  .refine((body) => Object.keys(body).length > 0, "Nothing to update.");
export type UpdateServiceRequest = z.output<typeof UpdateServiceRequest>;

export const SERVICE_SORT_FIELDS = ["name", "number", "status", "category", "updated", "created"] as const;
export type ServiceSortField = (typeof SERVICE_SORT_FIELDS)[number];
export const ServicesListQuery = listQuerySchema({
  sortFields: SERVICE_SORT_FIELDS,
  defaultSort: [{ field: "name", direction: "asc" }],
  filters: {
    name: { operators: ["contains", "not_contains"] },
    status: { operators: ["is", "is_not", "is_empty"], value: vocabularyKey },
    category: { operators: ["is", "is_not", "is_empty"], value: vocabularyKey },
    hosting: { operators: ["is", "is_not", "is_empty"], value: vocabularyKey },
    responsible: { operators: ["is", "is_empty", "is_not_empty"], value: z.uuid() },
    /** The "Access review" view: the service or one of its grants needs confirmation (or is planned/invited). */
    review: { operators: ["is"], value: z.enum(["true"]).transform(() => true) },
    archived: { operators: ["is"], value: z.enum(["true", "false"]).transform((value) => value === "true") },
  },
});
export type ServicesListQuery = z.output<typeof ServicesListQuery>;

const grantFields = {
  /** Optional own name; "<service> / <level>" when empty. */
  name: optionalText(200),
  personId: z.uuid().nullable().optional(),
  adminUserId: z.uuid().nullable().optional(),
  serviceId: z.uuid("Choose a service."),
  levelKey: vocabularyKey.nullable().optional(),
  statusKey: vocabularyKey.nullable().optional(),
  resourceScope: optionalText(1000),
  grantedOn: optionalDay,
  revokedOn: optionalDay,
  expiresOn: optionalDay,
};

const datesInOrder = (body: { grantedOn?: string | null; revokedOn?: string | null; expiresOn?: string | null }, context: z.RefinementCtx) => {
  if (body.grantedOn && body.revokedOn && body.revokedOn < body.grantedOn) {
    context.addIssue({ code: "custom", path: ["revokedOn"], message: "Revoked can't be before granted." });
  }
  if (body.grantedOn && body.expiresOn && body.expiresOn < body.grantedOn) {
    context.addIssue({ code: "custom", path: ["expiresOn"], message: "Expires can't be before granted." });
  }
};

export const CreateGrantRequest = z.strictObject(grantFields).superRefine(datesInOrder);
export type CreateGrantRequest = z.output<typeof CreateGrantRequest>;
export const UpdateGrantRequest = z
  .strictObject({ ...grantFields, serviceId: grantFields.serviceId.optional() })
  .superRefine(datesInOrder)
  .refine((body) => Object.keys(body).length > 0, "Nothing to update.");
export type UpdateGrantRequest = z.output<typeof UpdateGrantRequest>;

export const GRANT_SORT_FIELDS = ["name", "number", "service", "account", "level", "status", "expires", "updated", "created"] as const;
export type GrantSortField = (typeof GRANT_SORT_FIELDS)[number];
export const GrantsListQuery = listQuerySchema({
  sortFields: GRANT_SORT_FIELDS,
  defaultSort: [{ field: "name", direction: "asc" }],
  filters: {
    service: { operators: ["is", "is_not"], value: z.uuid() },
    person: { operators: ["is", "is_empty", "is_not_empty"], value: z.uuid() },
    account: { operators: ["is", "is_empty", "is_not_empty"], value: z.uuid() },
    level: { operators: ["is", "is_not", "is_empty"], value: vocabularyKey },
    status: { operators: ["is", "is_not", "is_empty"], value: vocabularyKey },
    /** The "Review queue" view: needs confirmation, planned or invited, or expiring within 30 days. */
    review: { operators: ["is"], value: z.enum(["true"]).transform(() => true) },
    archived: { operators: ["is"], value: z.enum(["true", "false"]).transform((value) => value === "true") },
  },
});
export type GrantsListQuery = z.output<typeof GrantsListQuery>;

export const DeleteRecordRequest = z.strictObject({ confirm: z.string().max(200) });
export type DeleteRecordRequest = z.output<typeof DeleteRecordRequest>;

export interface VocabularyEntry {
  key: string;
  label: string;
}
export interface Ref {
  id: string;
  name: string;
}
export interface GrantRef {
  id: string;
  service: string;
  level: string | null;
  status: VocabularyEntry | null;
}

export interface ServiceDto {
  id: string;
  serviceNumber: number;
  name: string;
  status: VocabularyEntry | null;
  category: VocabularyEntry | null;
  hostingModel: VocabularyEntry | null;
  url: string | null;
  description: string | null;
  responsible: Ref | null;
  /** Its grants (not archived), "<service> / <level>". */
  permissions: GrantRef[];
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GrantDto {
  id: string;
  grantNumber: number;
  name: string | null;
  /** The name shown: its own, or "<service> / <level>". */
  title: string;
  person: Ref | null;
  account: Ref | null;
  service: Ref;
  level: VocabularyEntry | null;
  status: VocabularyEntry | null;
  resourceScope: string | null;
  grantedOn: string | null;
  revokedOn: string | null;
  expiresOn: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ServicesOptionsDto {
  statuses: VocabularyEntry[];
  categories: VocabularyEntry[];
  hostingModels: VocabularyEntry[];
  levels: VocabularyEntry[];
  accessStatuses: VocabularyEntry[];
  /** Active admin accounts, for "Responsible account" and a grant's account. */
  accounts: Ref[];
}
