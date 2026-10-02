"use client";

import { useId } from "react";
import Link from "next/link";
import type { DocumentationArticleSummary, DocumentationContentBlock } from "@/modules/documentation/domain/types";
import { ShareButton } from "@/shared/ui/ShareButton";
import { Tag } from "@/shared/ui/Tag";
import { Highlight } from "@/shared/ui/Highlight";
import { Icon } from "@/shared/ui/icons";
import { FeedbackIssueActions } from "@/shared/ui/FeedbackIssueActions";
import { DocumentationContent } from "./DocumentationContent";
import { documentationAnchorHref } from "./documentationAnchor";
import { formatPublishedAt } from "./formatPublishedAt";

/**
 * One 40px accordion row (figma.pdf p15), with its own full-width bottom
 * stroke for row-to-row distinction (client feedback item 18 — a border on
 * the row itself, not a separate separator component). The article
 * row renders from metadata; its body arrives with the rest of the index's
 * streamed dataset (getDocumentationDataset), so expanding is a pure state
 * toggle with no per-row fetch (client feedback item 16) — at worst, on a
 * cold server, a body still in flight shows placeholder lines briefly.
 * Expansion is owned by DocumentationList (search, `#slug` deep links).
 *
 * The row is the `#<slug>` anchor, which is also what its share control
 * shares; the permanent article page stays reachable via "Published".
 */
export type ArticleBody = DocumentationContentBlock[] | "loading" | "error";

export function ArticleAccordionItem({
  article,
  body,
  expanded,
  onToggle,
  highlight,
}: {
  article: DocumentationArticleSummary;
  body: ArticleBody;
  expanded: boolean;
  onToggle: () => void;
  /** Active search query: every occurrence in title, tags and body is marked. */
  highlight?: string;
}) {
  const panelId = useId();
  const anchorHref = documentationAnchorHref(article.slug);

  return (
    // Stroke runs through the 8px gutters, edge to edge of the content area (figma.pdf p15/p17).
    <div id={article.slug} className="-mx-gutter border-b border-line px-gutter">
      <h2 className="text-body font-bold text-text-primary">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={panelId}
          // 39px + the wrapper's 1px stroke = Figma's 40px row pitch (figma.pdf p15).
          className="flex min-h-[2.4375rem] w-full items-center justify-between gap-2 py-2.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary"
        >
          <span>
            <Highlight text={article.title} query={highlight} />
          </span>
          <Icon name={expanded ? "expand_less" : "expand_more"} />
        </button>
      </h2>

      <div id={panelId} hidden={!expanded} className="pb-5">
        <div className="flex items-center gap-1 text-meta text-text-muted">
          <Link href={`/documentation/${article.slug}`} className="underline underline-offset-2 hover:text-text-primary">
            Published
          </Link>
          <span>{formatPublishedAt(article.publishedAt)}</span>
          {/* figma.pdf p15/p17: the share glyph in the Published row is muted, not white. */}
          <ShareButton url={anchorHref} title={article.title} className="-my-2.5 -mr-gutter ml-auto text-text-muted!" />
        </div>

        {article.expertise.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {article.expertise.map((tag) => (
              <Tag key={tag}>
                <Highlight text={tag} query={highlight} />
              </Tag>
            ))}
          </div>
        ) : null}

        <div className="mt-4">
          {body === "loading" ? (
            <div role="status" aria-label="Loading article" className="flex flex-col gap-2">
              {[100, 92, 96, 60].map((width) => (
                <div key={width} className="h-3 animate-pulse rounded-control bg-line" style={{ width: `${width}%` }} />
              ))}
            </div>
          ) : body === "error" ? (
            <p role="alert" className="text-body text-text-muted">
              This article&rsquo;s text couldn&rsquo;t be loaded from Notion right now.{" "}
              <a href={`/documentation/${article.slug}`} className="underline underline-offset-2">
                Open the article page
              </a>{" "}
              to try again.
            </p>
          ) : (
            <DocumentationContent blocks={body} headingLevelOffset={1} highlight={highlight} />
          )}
          <FeedbackIssueActions className="mt-5" source={anchorHref} />
        </div>
      </div>
    </div>
  );
}
