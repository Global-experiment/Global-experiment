"use client";

import { useState } from "react";
import { ArticleListItem } from "./ArticleListItem";
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
      <label htmlFor="documentation-search" className="sr-only">
        Search documentation
      </label>
      <input
        id="documentation-search"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search"
        className="w-full rounded-control border border-border-subtle bg-transparent px-4 py-3 text-sm text-text-primary placeholder:text-text-muted"
      />

      {filtered.length === 0 ? (
        <p className="mt-6 text-sm text-text-muted">No articles match &ldquo;{query}&rdquo;.</p>
      ) : (
        <div className="mt-2">
          {filtered.map((article) => (
            <ArticleListItem key={article.slug} article={article} />
          ))}
        </div>
      )}
    </div>
  );
}
