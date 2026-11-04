import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { cache } from "react";
import { Container } from "@/shared/ui/Container";
import { NavHeader } from "@/shared/ui/NavHeader";
import { Tag } from "@/shared/ui/Tag";
import { getArticleBySlug } from "@/modules/documentation/application/getArticleBySlug";
import { FeedbackIssueActions } from "@/shared/ui/FeedbackIssueActions";
import { DocumentationContent } from "@/modules/documentation/ui/DocumentationContent";
import { documentationMenu } from "@/modules/documentation/ui/documentationMenu";
import { formatPublishedAt, formatUpdatedAt } from "@/modules/documentation/ui/formatPublishedAt";
import { documentationAnchorHref } from "@/modules/documentation/ui/documentationAnchor";
import { fetchCurrentSlug } from "@/shared/config/publicApi";

// generateMetadata and the page both need the article; memoize within one
// request (the API response itself is cached under the `documentation` tag).
const loadArticle = cache(getArticleBySlug);

interface DocumentationArticlePageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: DocumentationArticlePageProps): Promise<Metadata> {
  const { slug } = await params;
  const article = await loadArticle(slug);
  if (!article) return {};
  return { title: article.title };
}

/**
 * The standalone article page uses the expanded-row layout from
 * figma.pdf p15 (metadata, tags, body, actions) under the sub-page header.
 * A slug an article had before it was renamed redirects to its new address,
 * so links already shared keep working.
 */
export default async function DocumentationArticlePage({ params }: DocumentationArticlePageProps) {
  const { slug } = await params;
  const article = await loadArticle(slug);

  if (!article) {
    const renamed = await fetchCurrentSlug(slug);
    if (renamed.ok) permanentRedirect(`/documentation/${renamed.data.slug}`);
    notFound();
  }

  const href = `/documentation/${article.slug}`;

  return (
    <main className="flex flex-1 flex-col pb-6">
      <NavHeader
        title={article.title}
        backHref="/documentation"
        shareUrl={documentationAnchorHref(article.slug)}
        menu={documentationMenu({
          url: documentationAnchorHref(article.slug),
          title: article.title,
          historyHref: `${href}/history`,
          note: <p>This page was last updated {formatUpdatedAt(article.updatedAt)}.</p>,
        })}
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
        <FeedbackIssueActions className="mt-5" />
      </Container>
    </main>
  );
}
