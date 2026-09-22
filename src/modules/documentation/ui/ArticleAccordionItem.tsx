"use client";

import { useId, useState } from "react";
import Link from "next/link";
import type { DocumentationArticle } from "@/modules/documentation/domain/types";
import { ShareButton } from "@/shared/ui/ShareButton";
import { Tag } from "@/shared/ui/Tag";
import { Icon } from "@/shared/ui/icons";
import { FeedbackIssueActions } from "@/shared/ui/FeedbackIssueActions";
import { DocumentationContent } from "./DocumentationContent";
import { formatPublishedAt } from "./formatPublishedAt";

/**
 * One 40px accordion row (figma.pdf p15), with its own full-width bottom
 * stroke for row-to-row distinction (client feedback item 18 — a border on
 * the row itself, not a separate separator component). The article
 * (including its full body) is already loaded by the index page — see
 * listPublishedArticlesWithContent — so expanding is a pure local state
 * toggle with no fetch and no loading spinner (client feedback item 16).
 * The permanent article page stays reachable through the "Published" link
 * and the share control.
 */
export function ArticleAccordionItem({ article }: { article: DocumentationArticle }) {
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();
  const articleHref = `/documentation/${article.slug}`;

  return (
    <div className="border-b border-line">
      <h2 className="text-body font-bold text-text-primary">
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          aria-controls={panelId}
          className="-mr-1 flex h-10 w-full items-center justify-between gap-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary"
        >
          <span>{article.title}</span>
          <Icon name={expanded ? "expand_less" : "expand_more"} size={24} />
        </button>
      </h2>

      <div id={panelId} hidden={!expanded} className="pb-5">
        <div className="flex items-center gap-1 text-meta text-text-muted">
          <Link href={articleHref} className="underline underline-offset-2 hover:text-text-primary">
            Published
          </Link>
          <span>{formatPublishedAt(article.publishedAt)}</span>
          <ShareButton url={articleHref} title={article.title} className="-my-2.5 -mr-gutter ml-auto" />
        </div>

        {article.expertise.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {article.expertise.map((tag) => (
              <Tag key={tag}>{tag}</Tag>
            ))}
          </div>
        ) : null}

        <div className="mt-4">
          <DocumentationContent blocks={article.content} headingLevelOffset={1} />
          <FeedbackIssueActions className="mt-5" />
        </div>
      </div>
    </div>
  );
}
