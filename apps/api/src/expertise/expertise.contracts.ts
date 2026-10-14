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
