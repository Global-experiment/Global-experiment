import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints";
import type { DocumentationArticleSummary } from "@/modules/documentation/domain/types";
import { logger } from "@/shared/logging/logger";

type NotionProperty = PageObjectResponse["properties"][string];

function getTitleText(property: NotionProperty | undefined): string | undefined {
  if (property?.type !== "title") return undefined;
  const text = property.title.map((item) => item.plain_text).join("");
  return text.length > 0 ? text : undefined;
}

function getRichText(property: NotionProperty | undefined): string | undefined {
  if (property?.type !== "rich_text") return undefined;
  const text = property.rich_text.map((item) => item.plain_text).join("");
  return text.length > 0 ? text : undefined;
}

function getNumber(property: NotionProperty | undefined): number | undefined {
  if (property?.type !== "number") return undefined;
  return property.number ?? undefined;
}

function getDate(property: NotionProperty | undefined): string | undefined {
  if (property?.type !== "date") return undefined;
  return property.date?.start ?? undefined;
}

function getMultiSelect(property: NotionProperty | undefined): string[] {
  if (property?.type !== "multi_select") return [];
  return property.multi_select.map((option) => option.name);
}

/**
 * Confirmed against the live database: Status is a "select" property. The
 * "status" type is also tolerated in case an editor converts it.
 */
function getStatusName(property: NotionProperty | undefined): string | undefined {
  if (property?.type === "status") return property.status?.name ?? undefined;
  if (property?.type === "select") return property.select?.name ?? undefined;
  return undefined;
}

/**
 * Confirmed against the live database: Archive is a "relation" property.
 * A page is treated as archived when the relation is non-empty (it has been
 * linked to an archive entry). Checkbox/select/status shapes are also
 * tolerated in case an editor converts the property type.
 */
function isArchivedProperty(property: NotionProperty | undefined): boolean {
  if (!property) return false;
  if (property.type === "relation") return property.relation.length > 0;
  if (property.type === "checkbox") return property.checkbox;
  if (property.type === "select") return property.select !== null;
  if (property.type === "status") return property.status !== null && property.status.name !== "Not archived";
  return false;
}

export interface MappedNotionPage {
  slug: string;
  title: string;
  displayOrder: number;
  expertise: string[];
  publishedAt: Date;
  status: string | undefined;
  archived: boolean;
}

const FALLBACK_DISPLAY_ORDER = Number.MAX_SAFE_INTEGER;

/**
 * Extracts and validates the properties needed to decide whether a Notion
 * page is a usable Documentation article at all. Returns null for
 * structurally unusable pages (missing title or slug) rather than throwing
 * — a single malformed page in Notion should not break the whole listing.
 */
export function mapNotionPageProperties(page: PageObjectResponse): MappedNotionPage | null {
  const properties = page.properties;

  const title = getTitleText(properties["Name"]);
  const slug = getRichText(properties["Slug"]);

  if (!title || !slug) {
    logger.warn("Skipping Notion Documentation page with missing title or slug", {
      pageId: page.id,
    });
    return null;
  }

  const displayOrderRaw = getNumber(properties["Display order"]);
  const displayOrder =
    displayOrderRaw !== undefined && Number.isFinite(displayOrderRaw)
      ? displayOrderRaw
      : FALLBACK_DISPLAY_ORDER;

  if (displayOrder === FALLBACK_DISPLAY_ORDER) {
    logger.warn("Notion Documentation page has missing/invalid Display order; sorting last", {
      pageId: page.id,
      slug,
    });
  }

  const publishedAtRaw = getDate(properties["Published at"]);
  const publishedAt = publishedAtRaw ? new Date(publishedAtRaw) : new Date(page.created_time);

  return {
    slug,
    title,
    displayOrder,
    expertise: getMultiSelect(properties["Expertise"]),
    publishedAt,
    status: getStatusName(properties["Status"]),
    archived: isArchivedProperty(properties["Archive"]),
  };
}

/**
 * Defensive publication filter — does not trust a single upstream flag.
 * Both conditions are checked independently: Status must explicitly equal
 * "Published", and the page must not be archived. See
 * docs/architecture/decisions/003-notion-temporary-adapter.md.
 */
export function isPubliclyVisible(mapped: MappedNotionPage): boolean {
  return mapped.status === "Published" && !mapped.archived;
}

export function toArticleSummary(mapped: MappedNotionPage): DocumentationArticleSummary {
  return {
    slug: mapped.slug,
    title: mapped.title,
    displayOrder: mapped.displayOrder,
    expertise: mapped.expertise,
    publishedAt: mapped.publishedAt,
  };
}
