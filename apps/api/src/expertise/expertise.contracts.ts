import { z } from "zod";

const name = z.string().trim().min(1, "Name is required.").max(120);

export const CreateDomainRequest = z.strictObject({ name });
export const CreateFieldRequest = z.strictObject({ name, domainId: z.uuid() });
export const CreateExpertiseRequest = z.strictObject({ name, fieldId: z.uuid() });
/** Renames only; moving a node to another parent is not an editorial operation yet. */
export const RenameRequest = z.strictObject({ name });

export type CreateDomainRequest = z.output<typeof CreateDomainRequest>;
export type CreateFieldRequest = z.output<typeof CreateFieldRequest>;
export type CreateExpertiseRequest = z.output<typeof CreateExpertiseRequest>;
export type RenameRequest = z.output<typeof RenameRequest>;

export type ExpertiseLevel = "domain" | "field" | "expertise";

/**
 * Expertise search for pickers: name, Stable ID, field and domain names.
 * Active items only by default; `includeInactive` adds Proposed/Deprecated
 * (and status-less) items, returned as not selectable.
 */
export const ExpertiseSearchQuery = z.object({
  q: z.string().trim().max(200).optional().transform((value) => value || undefined),
  page: z.coerce.number().int().min(1).max(1_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  includeInactive: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
});
export type ExpertiseSearchQuery = z.output<typeof ExpertiseSearchQuery>;

export interface ExpertiseSearchItemDto {
  id: string;
  name: string;
  stableId: string | null;
  status: TaxonomyVocabularyEntry | null;
  field: { id: string; name: string };
  domain: { id: string; name: string };
  /** "Domain > Field > Expertise". */
  path: string;
  teams: TaxonomyVocabularyEntry[];
  /** Only Active items can be newly linked. */
  selectable: boolean;
}

export interface TaxonomyVocabularyEntry {
  key: string;
  label: string;
}

/**
 * Notion-side attributes every level carries. Read-only here: the import
 * sets them (docs/architecture/data-model.md §4–5); rows created in the
 * admin have none.
 */
export interface TaxonomyNotionAttributes {
  stableId: string | null;
  status: TaxonomyVocabularyEntry | null;
}

export interface ExpertiseItemDto extends TaxonomyNotionAttributes {
  id: string;
  name: string;
  /** Teams this expertise belongs to (recorded only). */
  teams: TaxonomyVocabularyEntry[];
  peopleCount: number;
  organizationCount: number;
}

export interface ExpertiseFieldDto extends TaxonomyNotionAttributes {
  id: string;
  name: string;
  items: ExpertiseItemDto[];
}

export interface ExpertiseDomainDto extends TaxonomyNotionAttributes {
  id: string;
  name: string;
  fields: ExpertiseFieldDto[];
}

export interface ExpertiseTreeDto {
  domains: ExpertiseDomainDto[];
}
