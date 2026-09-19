"use client";

import { useState } from "react";
import { Icon } from "@/shared/ui/icons";
import { ArticleAccordionItem } from "./ArticleAccordionItem";
import type { DocumentationArticleSummary } from "@/modules/documentation/domain/types";

/**
 * Search control (32px outlined field, Material `search` glyph, 14px
 * placeholder — figma.pdf p15) above the accordion rows. Filtering is
 * client-side on the already-fetched summaries; no Notion query per
 * keystroke. Rows have no dividers between them, as in the design.
 */
export function DocumentationList({
  articles,
  children,
}: {
  articles: DocumentationArticleSummary[];
  /** Page heading + intro, rendered between the search and the list. */
  children?: React.ReactNode;
}) {
  const [query, setQuery] = useState("");
  const trimmed = query.trim().toLowerCase();
  const filtered = trimmed ? articles.filter((a) => a.title.toLowerCase().includes(trimmed)) : articles;

  return (
    <div>
      <div className="relative">
        <Icon
          name="search"
          size={18}
          className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-text-primary"
        />
        <label htmlFor="documentation-search" className="sr-only">
          Search documentation
        </label>
        <input
          id="documentation-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search"
          className="h-8 w-full rounded-control border border-line bg-transparent pr-2 pl-8 text-body text-text-primary placeholder:text-text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        />
      </div>

      {children}

      {filtered.length === 0 ? (
        <p className="mt-3 text-body text-text-muted">No articles match &ldquo;{query}&rdquo;.</p>
      ) : (
        <div className="mt-3">
          {filtered.map((article) => (
            <ArticleAccordionItem key={article.slug} article={article} />
          ))}
        </div>
      )}
    </div>
  );
}
