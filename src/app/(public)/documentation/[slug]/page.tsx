import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { Container } from "@/shared/ui/Container";
import { NavHeader } from "@/shared/ui/NavHeader";
import { Tag } from "@/shared/ui/Tag";
import { getArticleBySlug } from "@/modules/documentation/application/getArticleBySlug";
import { ArticleActions } from "@/modules/documentation/ui/ArticleActions";
import { DocumentationContent } from "@/modules/documentation/ui/DocumentationContent";
import { DocumentationPageMenu } from "@/modules/documentation/ui/DocumentationPageMenu";
import { formatPublishedAt } from "@/modules/documentation/ui/formatPublishedAt";

// Live Notion on every request — no route cache, no data cache — so edits in
// Notion show on the next refresh. No Suspense boundary (ADR 007).
export const dynamic = "force-dynamic";

// generateMetadata and the page both need the article; memoize within one
// request so Notion is read once per request, not twice. This is per-request
// de-duplication only, never a persistent cache.
const loadArticle = cache(getArticleBySlug);

interface DocumentationArticlePageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: DocumentationArticlePageProps): Promise<Metadata> {
  const { slug } = await params;
  const article = await loadArticle(slug);
  if (!article) return {};
  return { title: `${article.title} — Documentation — Global Experiment` };
}

/**
 * The standalone article page uses the expanded-row layout from
 * figma.pdf p15 (metadata, tags, body, actions) under the sub-page header.
 */
export default async function DocumentationArticlePage({ params }: DocumentationArticlePageProps) {
  const { slug } = await params;
  const article = await loadArticle(slug);

  if (!article) {
    notFound();
  }

  const href = `/documentation/${article.slug}`;

  return (
    <main className="flex flex-1 flex-col pb-6">
      <NavHeader
        title={article.title}
        backHref="/documentation"
        actions={<DocumentationPageMenu url={href} title={article.title} />}
      />
      <Container className="pt-1">
        <p className="text-meta text-text-muted">Published {formatPublishedAt(article.publishedAt)}</p>
        {article.expertise.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {article.expertise.map((tag) => (
              <Tag key={tag}>{tag}</Tag>
            ))}
          </div>
        ) : null}
        <div className="mt-4">
          <DocumentationContent blocks={article.content} />
        </div>
        <ArticleActions className="mt-5" />
      </Container>
    </main>
  );
}
