import type { DocumentationRepository } from "@/modules/documentation/domain/DocumentationRepository";
import { NotionDocumentationRepository } from "./NotionDocumentationRepository";

let cached: DocumentationRepository | undefined;

/**
 * The single composition point for the Documentation source. It is always
 * live Notion — in development, staging and production alike. There is no
 * fixture, mock or fallback repository in the running application: if
 * Notion is misconfigured or unreachable the request fails clearly (see
 * ADR 009). A future Postgres-backed repository replaces the class here.
 */
export function getDocumentationRepository(): DocumentationRepository {
  cached ??= new NotionDocumentationRepository();
  return cached;
}
