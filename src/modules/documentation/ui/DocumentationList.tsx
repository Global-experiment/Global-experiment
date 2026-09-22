"use client";

import { useMemo, useRef, useState } from "react";
import { Icon } from "@/shared/ui/icons";
import { ArticleAccordionItem } from "./ArticleAccordionItem";
import { buildSearchHaystack, searchArticles } from "./searchArticles";
import type { DocumentationArticle } from "@/modules/documentation/domain/types";

/**
 * Search control (32px outlined field, Material Sharp `search` glyph, 14px
 * placeholder — figma.pdf p15) above the accordion rows.
 *
 * `articles` arrive fully preloaded (title, tags and body — see
 * listPublishedArticlesWithContent), so search reaches full article text
 * and tags, not just the title (client feedback item 15), with zero extra
 * Notion calls per keystroke — each article's searchable text is computed
 * once with useMemo, not on every render. Matching rows stay collapsed:
 * filtering never changes a row's expanded state.
 */
export function DocumentationList({
  articles,
  children,
}: {
  articles: DocumentationArticle[];
  /** Page heading + intro, rendered between the search and the list. */
  children?: React.ReactNode;
}) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const haystacks = useMemo(
    () => new Map(articles.map((article) => [article.slug, buildSearchHaystack(article)])),
    [articles],
  );
  const filtered = useMemo(() => searchArticles(articles, haystacks, query), [articles, haystacks, query]);

  function clear() {
    setQuery("");
    inputRef.current?.focus();
  }

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
          ref={inputRef}
          id="documentation-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search"
          className="h-8 w-full rounded-control border border-line bg-transparent pr-8 pl-8 text-body text-text-primary placeholder:text-text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary [&::-webkit-search-cancel-button]:hidden"
        />
        {query ? (
          <button
            type="button"
            onClick={clear}
            aria-label="Clear search"
            className="absolute top-1/2 right-1 flex size-6 -translate-y-1/2 items-center justify-center rounded-control text-text-primary hover:ring-1 hover:ring-content-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary"
          >
            <Icon name="close" size={16} />
          </button>
        ) : null}
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
