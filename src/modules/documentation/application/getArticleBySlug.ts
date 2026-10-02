import { getDocumentationDataset } from "@/modules/documentation/application/getDocumentationDataset";
import type { DocumentationArticle } from "@/modules/documentation/domain/types";

/**
 * Reads from the same cached dataset the index page uses, rather than
 * issuing its own fresh Notion fetch — visiting an article directly (or its
 * history) no longer re-fetches everything Notion already gave the index
 * moments earlier.
 */
export async function getArticleBySlug(slug: string): Promise<DocumentationArticle | null> {
  const dataset = await getDocumentationDataset();
  return dataset.find((article) => article.slug === slug) ?? null;
}
