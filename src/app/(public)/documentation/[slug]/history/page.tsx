import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { Container } from "@/shared/ui/Container";
import { NavHeader } from "@/shared/ui/NavHeader";
import { Tag } from "@/shared/ui/Tag";
import { getArticleBySlug } from "@/modules/documentation/application/getArticleBySlug";
import { FeedbackIssueActions } from "@/shared/ui/FeedbackIssueActions";
import { DocumentationContent } from "@/modules/documentation/ui/DocumentationContent";
import { DocumentationPageMenu } from "@/modules/documentation/ui/DocumentationPageMenu";
import { formatPublishedAt } from "@/modules/documentation/ui/formatPublishedAt";

export const dynamic = "force-dynamic";

const loadArticle = cache(getArticleBySlug);

interface HistoryPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: HistoryPageProps): Promise<Metadata> {
  const { slug } = await params;
  const article = await loadArticle(slug);
  if (!article) return {};
  return { title: `${article.title} — Document history — Global Experiment` };
}

/**
 * figma.pdf p17's "Document history" screen shows several dated cards of
 * the same article. There is no real data source for that here: neither
 * the Notion export nor the public Notion API this app is built on exposes
 * page revision history (see the note on DocumentationRepository — this
 * was already investigated before this route existed). Rather than invent
 * timestamps or wording for past versions (explicitly ruled out — client
 * feedback item 19), this shows the one real, currently known version —
 * live from Notion, same as the article page — clearly labeled as the only
 * version available, so the client can see the card layout render with
 * genuine content instead of an empty page.
 */
export default async function DocumentationHistoryPage({ params }: HistoryPageProps) {
  const { slug } = await params;
  const article = await loadArticle(slug);

  if (!article) {
    notFound();
  }

  const articleHref = `/documentation/${article.slug}`;

  return (
    <main className="flex flex-1 flex-col pb-6">
      <NavHeader
        title="Document history"
        backHref={articleHref}
        actions={<DocumentationPageMenu url={`${articleHref}/history`} title={`${article.title} — Document history`} />}
      />
      <Container className="pt-1">
        <p role="status" className="text-body text-text-muted">
          No verifiable previous revision is available from the current data source: Notion&rsquo;s API
          doesn&rsquo;t expose a page&rsquo;s edit history to this integration. Shown below is the current
          published version — the only version this page can genuinely display.
        </p>

        <div className="mt-6 border-t border-line pt-4">
          <p className="text-body font-bold text-text-primary">{article.title}</p>
          <p className="mt-1 text-meta text-text-muted">
            Current version — {formatPublishedAt(article.publishedAt)}
          </p>
          {article.expertise.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {article.expertise.map((tag) => (
                <Tag key={tag}>{tag}</Tag>
              ))}
            </div>
          ) : null}
          <div className="mt-4">
            <DocumentationContent blocks={article.content} headingLevelOffset={1} />
          </div>
          <FeedbackIssueActions className="mt-5" />
        </div>
      </Container>
    </main>
  );
}
