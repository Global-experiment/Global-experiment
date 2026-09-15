"use client";

import { useState } from "react";
import { ArticleAccordionItem } from "./ArticleAccordionItem";
import type { DocumentationArticleSummary } from "@/modules/documentation/domain/types";

/**
 * Client-side filtering only — operates on the already-fetched summary
 * list, no additional Notion query per keystroke.
 */
export function DocumentationList({ articles }: { articles: DocumentationArticleSummary[] }) {
  const [query, setQuery] = useState("");
  const trimmed = query.trim().toLowerCase();
  const filtered = trimmed ? articles.filter((a) => a.title.toLowerCase().includes(trimmed)) : articles;

  return (
    <div>
      <div className="relative">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.3-4.3" />
        </svg>
        <label htmlFor="documentation-search" className="sr-only">
          Search documentation
        </label>
        <input
          id="documentation-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search"
          className="w-full rounded-control border border-border-subtle bg-transparent py-3 pl-9 pr-4 text-sm text-text-primary placeholder:text-text-muted"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="mt-6 text-sm text-text-muted">No articles match &ldquo;{query}&rdquo;.</p>
      ) : (
        <div className="mt-2">
          {filtered.map((article) => (
            <ArticleAccordionItem key={article.slug} article={article} />
          ))}
        </div>
      )}
    </div>
  );
}
