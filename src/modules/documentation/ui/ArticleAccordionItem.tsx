"use client";

import { useState } from "react";
import Link from "next/link";
import { Tag } from "@/shared/ui/Tag";
import type { DocumentationArticleSummary } from "@/modules/documentation/domain/types";

const dateFormatter = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" });

/**
 * Preserves Figma's accordion visual/interaction pattern on the index:
 * expanding reveals metadata (tags, published date) and a link into the
 * full article. Full content blocks stay exclusive to
 * /documentation/[slug] — expanding here never fetches or duplicates them,
 * so the index and the article route coexist without extra Notion calls.
 */
export function ArticleAccordionItem({ article }: { article: DocumentationArticleSummary }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-b border-border-faint">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-3 py-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        <span className="text-sm font-bold text-text-primary">{article.title}</span>
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {expanded ? (
        <div className="pb-4">
          <p className="text-xs text-text-muted">
            Published {dateFormatter.format(article.publishedAt)}
          </p>
          {article.expertise.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {article.expertise.map((tag) => (
                <Tag key={tag}>{tag}</Tag>
              ))}
            </div>
          ) : null}
          <Link
            href={`/documentation/${article.slug}`}
            className="mt-3 inline-block text-sm font-semibold text-text-primary underline underline-offset-2"
          >
            Read full article
          </Link>
        </div>
      ) : null}
    </div>
  );
}
