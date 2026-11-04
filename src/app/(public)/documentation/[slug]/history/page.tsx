import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { Container } from "@/shared/ui/Container";
import { NavHeader } from "@/shared/ui/NavHeader";
import { Tag } from "@/shared/ui/Tag";
import { getArticleBySlug } from "@/modules/documentation/application/getArticleBySlug";
import { FeedbackIssueActions } from "@/shared/ui/FeedbackIssueActions";
import { DocumentationContent } from "@/modules/documentation/ui/DocumentationContent";
import { documentationMenu } from "@/modules/documentation/ui/documentationMenu";
import { formatPublishedAt } from "@/modules/documentation/ui/formatPublishedAt";
import { documentationAnchorHref } from "@/modules/documentation/ui/documentationAnchor";
import { fetchCmsVersions } from "@/shared/config/publicApi";
import { ProviderError } from "@/shared/errors/app-error";

const loadArticle = cache(getArticleBySlug);

interface HistoryPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: HistoryPageProps): Promise<Metadata> {
  const { slug } = await params;
  const article = await loadArticle(slug);
  if (!article) return {};
  return { title: "Document history" };
}

/**
 * figma.pdf p17's "Document history": one dated card per version of the
 * article that was published, newest first (OPS-28) — real revisions from
 * the native API, never invented ones. Drafts never appear here, and no
 * author names: visitors see dates only.
 */
export default async function DocumentationHistoryPage({ params }: HistoryPageProps) {
  const { slug } = await params;
  const article = await loadArticle(slug);
  if (!article) notFound();
  const result = await fetchCmsVersions(article.slug);
  if (!result.ok) throw new ProviderError("The document history couldn't be loaded.");
  const versions = result.data.versions;

  const articleHref = `/documentation/${article.slug}`;

  return (
    <main className="flex flex-1 flex-col pb-6">
      <NavHeader
        title="Document history"
        backHref={articleHref}
        shareUrl={documentationAnchorHref(article.slug)}
        menu={documentationMenu({ url: documentationAnchorHref(article.slug), title: article.title })}
      />
      <Container className="pt-1">
        <p className="text-body text-text-muted">{versions.length === 1 ? "One published version." : `${versions.length} published versions, newest first.`}</p>
        <ol aria-label="Published versions">
          {versions.map((version, index) => (
            <li key={version.number} data-version={version.number} className="mt-6 border-t border-line pt-4">
              <p className="text-body font-bold text-text-primary">{version.title}</p>
              <p className="mt-1 text-meta text-text-muted">
                {index === 0 ? "Current version" : `Version ${version.number}`}, published {formatPublishedAt(new Date(version.publishedAt))}
              </p>
              {version.expertise.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {version.expertise.map((tag) => (
                    <Tag key={tag}>{tag}</Tag>
                  ))}
                </div>
              ) : null}
              <div className="mt-4">
                <DocumentationContent blocks={version.content} headingLevelOffset={1} />
              </div>
            </li>
          ))}
        </ol>
        <FeedbackIssueActions className="mt-5" />
      </Container>
    </main>
  );
}
