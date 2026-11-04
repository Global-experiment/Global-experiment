import { getDocumentationDataset } from "@/modules/documentation/application/getDocumentationDataset";
import type { DocumentationArticle } from "@/modules/documentation/domain/types";

/**
 * Reads from the same cached dataset the index page uses (one cached API
 * response for every article), so an article page needs no request of its own.
 */
export async function getArticleBySlug(slug: string): Promise<DocumentationArticle | null> {
  const dataset = await getDocumentationDataset();
  return dataset.find((article) => article.slug === slug) ?? null;
}
