import { isNotionConfigured } from "@/shared/config/env";
import { InternalError } from "@/shared/errors/app-error";
import type { DocumentationRepository } from "@/modules/documentation/domain/DocumentationRepository";
import { NotionDocumentationRepository } from "./NotionDocumentationRepository";
import { FixtureDocumentationRepository } from "./FixtureDocumentationRepository";

let cached: DocumentationRepository | undefined;

/**
 * The one place that decides which DocumentationRepository implementation
 * is active. Falls back to fixture data only outside production, so the
 * feature can be built and browsed locally before live credentials
 * arrive — application/ and ui/ code never make this choice themselves.
 *
 * In production, missing Notion credentials fail loudly instead of
 * silently serving placeholder content to real visitors.
 */
export function getDocumentationRepository(): DocumentationRepository {
  if (cached) return cached;

  if (isNotionConfigured()) {
    cached = new NotionDocumentationRepository();
    return cached;
  }

  if (process.env.NODE_ENV === "production") {
    throw new InternalError(
      "NOTION_API_KEY and NOTION_DOCUMENTATION_DB_ID must be set in production — refusing to fall back to fixture data.",
    );
  }

  cached = new FixtureDocumentationRepository();
  return cached;
}
