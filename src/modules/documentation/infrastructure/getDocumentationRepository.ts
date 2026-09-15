import { isNotionConfigured } from "@/shared/config/env";
import type { DocumentationRepository } from "@/modules/documentation/domain/DocumentationRepository";
import { NotionDocumentationRepository } from "./NotionDocumentationRepository";
import { FixtureDocumentationRepository } from "./FixtureDocumentationRepository";

let cached: DocumentationRepository | undefined;

/**
 * The one place that decides which DocumentationRepository implementation
 * is active. Falls back to fixture data when Notion credentials aren't
 * configured, so the feature can be built and browsed locally before live
 * credentials arrive — application/ and ui/ code never make this choice
 * themselves.
 */
export function getDocumentationRepository(): DocumentationRepository {
  if (cached) return cached;
  cached = isNotionConfigured()
    ? new NotionDocumentationRepository()
    : new FixtureDocumentationRepository();
  return cached;
}
