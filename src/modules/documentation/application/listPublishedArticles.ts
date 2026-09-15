import { getDocumentationRepository } from "@/modules/documentation/infrastructure/getDocumentationRepository";
import type { DocumentationArticleSummary } from "@/modules/documentation/domain/types";

export function listPublishedArticles(): Promise<DocumentationArticleSummary[]> {
  return getDocumentationRepository().listPublished();
}
