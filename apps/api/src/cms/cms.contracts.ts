import { z } from "zod";
import { FIELD_MESSAGES, isSlug } from "../common/field-rules.js";
import { Content, type ContentBlock } from "./content.js";

/** A slug: lowercase words joined by hyphens ("version-0-1-scope"), as in the public URL. */
export const Slug = z
  .string()
  .trim()
  .min(1, "Add a slug.")
  .max(100, "Slugs can be at most 100 characters.")
  // The shared rule (common/field-rules.ts): the page checks the same when the field is left.
  .refine(isSlug, FIELD_MESSAGES.slug);

/** Up to 10 expertise tags (admin-desktop.pdf p10: "Documents can have up to 10 expertise"). */
export const Expertise = z
  .array(z.string().trim().min(1).max(80))
  .max(10, "Documents can have up to 10 expertise.")
  .transform((tags) => [...new Map(tags.map((tag) => [tag.toLowerCase(), tag])).values()]);

const Summary = z
  .string()
  .trim()
  .max(500, "Keep the summary under 500 characters.")
  .nullish()
  .transform((value) => value || null);

const Article = {
  title: z.string().trim().min(1, "Add a title.").max(200, "Titles can be at most 200 characters."),
  slug: Slug,
  expertise: Expertise.default([]),
  displayOrder: z.number().int().min(-100_000).max(100_000).default(0),
  content: Content,
  summary: Summary,
  /** Publish this revision right away (cms.publish); otherwise it's saved as a draft. */
  publish: z.boolean().default(false),
};

export const CreateDocumentRequest = z.strictObject(Article);
export type CreateDocumentRequest = z.output<typeof CreateDocumentRequest>;

/** A save: always a new revision. `baseRevisionId` is the revision the editor started from (a newer one in between is a conflict). */
export const SaveRevisionRequest = z.strictObject({ ...Article, baseRevisionId: z.uuid().nullable() });
export type SaveRevisionRequest = z.output<typeof SaveRevisionRequest>;

/** Home has no title, slug, expertise or order of its own. */
export const SaveHomeRequest = z.strictObject({ content: Content, summary: Summary, publish: z.boolean().default(false), baseRevisionId: z.uuid().nullable() });
export type SaveHomeRequest = z.output<typeof SaveHomeRequest>;

export const PublishRequest = z.strictObject({ revisionId: z.uuid() });
export type PublishRequest = z.output<typeof PublishRequest>;

export const RestoreRevisionRequest = z.strictObject({ publish: z.boolean().default(false) });
export type RestoreRevisionRequest = z.output<typeof RestoreRevisionRequest>;

export type DocumentState = "published" | "draft" | "unpublished" | "archived";

export interface RevisionDto {
  id: string;
  number: number;
  status: "draft" | "published";
  title: string;
  slug: string;
  expertise: string[];
  content: ContentBlock[];
  summary: string | null;
  author: string;
  createdAt: string;
  publishedAt: string | null;
  publishedBy: string | null;
  /** The version this one restores, if it is a restore. */
  restoredFrom: number | null;
}

export type RevisionSummaryDto = Omit<RevisionDto, "content" | "expertise" | "slug"> & {
  /** The version visitors see. */
  live: boolean;
  latest: boolean;
};

export interface DocumentDto {
  id: string;
  number: number;
  kind: "home" | "article";
  displayOrder: number;
  state: DocumentState;
  /** The newest revision is newer than the published one (unpublished changes). */
  hasDraft: boolean;
  firstPublishedAt: string | null;
  unpublishedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  latest: RevisionDto;
  live: { id: string; number: number; publishedAt: string; publishedBy: string | null } | null;
  /** What the viewer may do (cms.update, cms.publish), so the page never offers a refused action. */
  permissions: { edit: boolean; publish: boolean };
}

export interface DocumentListItemDto {
  id: string;
  number: number;
  title: string;
  slug: string;
  state: DocumentState;
  hasDraft: boolean;
  expertise: string[];
  displayOrder: number;
  firstPublishedAt: string | null;
  lastPublishedAt: string | null;
  updatedAt: string;
  createdAt: string;
  lastEditedBy: string;
}

export interface CmsImageDto {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
}

/** Public shapes (no author names: visitors see dates only). */
export interface PublicHomeDto {
  content: ContentBlock[];
  publishedAt: string;
}

export interface PublicArticleDto {
  slug: string;
  title: string;
  displayOrder: number;
  expertise: string[];
  /** First publication ("Published …"). */
  publishedAt: string;
  /** When the version shown was written ("last updated …"). */
  updatedAt: string;
  content: ContentBlock[];
}

export interface PublicVersionDto {
  number: number;
  title: string;
  expertise: string[];
  publishedAt: string;
  content: ContentBlock[];
}
