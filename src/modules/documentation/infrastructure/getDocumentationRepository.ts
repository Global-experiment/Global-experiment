import type { DocumentationRepository } from "@/modules/documentation/domain/DocumentationRepository";
import type { DocumentationArticle, DocumentationArticleSummary } from "@/modules/documentation/domain/types";
import { fetchCmsDocumentation, type PublicArticle } from "@/shared/config/publicApi";
import { ProviderError } from "@/shared/errors/app-error";

const toArticle = (article: PublicArticle): DocumentationArticle => ({
  slug: article.slug,
  title: article.title,
  displayOrder: article.displayOrder,
  expertise: article.expertise,
  publishedAt: new Date(article.publishedAt),
  updatedAt: new Date(article.updatedAt),
  content: article.content,
});

/**
 * Documentation from the native API (ADR 020): every published article, in
 * Display order, with its body — one request, cached under the
 * `documentation` tag and revalidated on every publication. When the API
 * can't answer, the page fails with an error status (ADR 007, ADR 009).
 */
class ApiDocumentationRepository implements DocumentationRepository {
  async listPublishedWithContent(): Promise<DocumentationArticle[]> {
    const result = await fetchCmsDocumentation();
    if (!result.ok) throw new ProviderError("The Documentation couldn't be loaded.");
    return result.data.articles.map(toArticle);
  }

  async listPublished(): Promise<DocumentationArticleSummary[]> {
    return (await this.listPublishedWithContent()).map((article) => ({
      slug: article.slug,
      title: article.title,
      displayOrder: article.displayOrder,
      expertise: article.expertise,
      publishedAt: article.publishedAt,
      updatedAt: article.updatedAt,
    }));
  }

  async getBySlug(slug: string): Promise<DocumentationArticle | null> {
    return (await this.listPublishedWithContent()).find((article) => article.slug === slug) ?? null;
  }
}

let cached: DocumentationRepository | undefined;

export function getDocumentationRepository(): DocumentationRepository {
  cached ??= new ApiDocumentationRepository();
  return cached;
}
