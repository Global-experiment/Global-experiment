import { getDocumentationRepository } from "@/modules/documentation/infrastructure/getDocumentationRepository";
import type { DocumentationArticle } from "@/modules/documentation/domain/types";

export function getArticleBySlug(slug: string): Promise<DocumentationArticle | null> {
  return getDocumentationRepository().getBySlug(slug);
}
