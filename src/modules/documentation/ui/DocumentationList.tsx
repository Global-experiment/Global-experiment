"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Icon } from "@/shared/ui/icons";
import { ArticleAccordionItem } from "./ArticleAccordionItem";
import { focusRow, initialAccordionState, isExpanded, queryChanged, toggleRow } from "./accordionState";
import { slugFromHash } from "./documentationAnchor";
import { buildSearchHaystack, searchArticles } from "./searchArticles";
import type {
  DocumentationArticle,
  DocumentationArticleSummary,
  DocumentationContentBlock,
} from "@/modules/documentation/domain/types";

function subscribeToHash(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  window.addEventListener("popstate", onChange);
  return () => {
    window.removeEventListener("hashchange", onChange);
    window.removeEventListener("popstate", onChange);
  };
}

/**
 * Search control (32px outlined field, Material Sharp `search` glyph, 14px
 * placeholder — figma.pdf p15) above the accordion rows.
 *
 * Metadata-first: rows render from `articles` (title, tags, dates — one
 * cached Notion query) and the bodies arrive through `content`, a promise
 * the server streams in behind them. Until it resolves, search covers title
 * and tags (and says so); afterwards full article text, case-insensitively
 * (client feedback item 15), with zero extra Notion calls per keystroke —
 * each article's searchable text is computed once. A failed body load is
 * reported as such, never shown as an empty article.
 *
 * While a query is active every matching row is expanded and every
 * occurrence is marked in its title, tags and body; clearing the query
 * returns to the normal accordion (see accordionState). A `#<slug>` hash —
 * on load or on change — expands only that row and scrolls to it.
 */
export function DocumentationList({
  articles,
  content,
  children,
}: {
  articles: DocumentationArticleSummary[];
  /** Every article with its body (streamed after the rows). */
  content: Promise<DocumentationArticle[]>;
  /** Page heading + intro, rendered between the search and the list. */
  children?: React.ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [accordion, setAccordion] = useState(initialAccordionState);
  const [bodies, setBodies] = useState<ReadonlyMap<string, DocumentationContentBlock[]> | "loading" | "error">(
    "loading",
  );
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let current = true;
    content.then(
      (full) => current && setBodies(new Map(full.map((article) => [article.slug, article.content]))),
      () => current && setBodies("error"),
    );
    return () => {
      current = false;
    };
  }, [content]);

  const haystacks = useMemo(
    () =>
      new Map(
        articles.map((article) => [
          article.slug,
          buildSearchHaystack({ ...article, content: typeof bodies === "string" ? undefined : bodies.get(article.slug) }),
        ]),
      ),
    [articles, bodies],
  );
  const slugs = useMemo(() => new Set(articles.map((article) => article.slug)), [articles]);
  const filtered = useMemo(() => searchArticles(articles, haystacks, query), [articles, haystacks, query]);
  const searching = query.trim() !== "";

  // The hash is client-only; the server render (and hydration) see "".
  const hash = useSyncExternalStore(subscribeToHash, () => window.location.hash, () => "");
  const target = slugFromHash(hash, slugs);
  const [appliedHash, setAppliedHash] = useState("");
  if (hash !== appliedHash) {
    // Adjusting state during render (not in an effect) when the hash moves.
    setAppliedHash(hash);
    if (target) {
      setQuery("");
      setAccordion(focusRow(target));
    }
  }

  // Scroll to the deep-linked article — and keep it there while the layout
  // settles (Review #3 item 7). The first scroll happens while article bodies
  // are still streaming in, when the page may not even be scrollable yet;
  // a one-off scrollIntoView then left visitors at the top. So: align after
  // layout (next frame), re-align on every size change of the page until
  // the content has arrived, and stop at the first sign of the visitor
  // scrolling themselves (or after a few seconds). Instant, not smooth, so
  // reduced-motion needs nothing extra; rows have no sticky header above.
  useLayoutEffect(() => {
    if (!target || hash !== appliedHash) return;
    const row = document.getElementById(target);
    if (!row) return;
    let frame = 0;
    const align = () => {
      frame = 0;
      row.scrollIntoView({ block: "start", behavior: "instant" });
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(align);
    };
    const resize = new ResizeObserver(schedule);
    const userEvents = ["wheel", "touchstart", "keydown", "pointerdown"] as const;
    const stop = () => {
      resize.disconnect();
      if (frame) cancelAnimationFrame(frame);
      frame = -1; // never schedule again
      for (const type of userEvents) window.removeEventListener(type, stop);
      clearTimeout(timeout);
    };
    const timeout = setTimeout(stop, 5000);
    schedule();
    resize.observe(document.body);
    for (const type of userEvents) window.addEventListener(type, stop, { passive: true });
    return stop;
  }, [target, hash, appliedHash]);

  function changeQuery(value: string) {
    setQuery(value);
    setAccordion(queryChanged);
  }

  function clear() {
    changeQuery("");
    inputRef.current?.focus();
  }

  return (
    <div>
      <div className="relative">
        <Icon
          name="search"
          className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-text-primary"
        />
        <label htmlFor="documentation-search" className="sr-only">
          Search documentation
        </label>
        <input
          ref={inputRef}
          id="documentation-search"
          type="search"
          value={query}
          onChange={(event) => changeQuery(event.target.value)}
          placeholder="Search"
          autoComplete="off"
          autoCorrect="on"
          spellCheck
          className="h-8 w-full rounded-control border border-line bg-transparent pr-8 pl-[calc(2rem-1px)] text-body text-text-primary placeholder:text-text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary [&::-webkit-search-cancel-button]:hidden"
        />
        {query ? (
          <button
            type="button"
            onClick={clear}
            aria-label="Clear search"
            className="absolute top-1/2 right-1 flex size-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-control text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary"
          >
            <Icon name="close" size={16} />
          </button>
        ) : null}
      </div>

      {children}

      {searching && typeof bodies === "string" ? (
        <p role="status" className="mt-3 text-meta text-text-muted">
          {bodies === "loading"
            ? "Searching titles and tags — article text is still loading."
            : "Article text couldn’t be loaded from Notion, so only titles and tags are searched."}
        </p>
      ) : null}

      {filtered.length === 0 ? (
        <p className="mt-3 text-body text-text-muted">No articles match &ldquo;{query}&rdquo;.</p>
      ) : (
        <div className="mt-2">
          {filtered.map((article) => (
            <ArticleAccordionItem
              key={article.slug}
              article={article}
              body={typeof bodies === "string" ? bodies : (bodies.get(article.slug) ?? "error")}
              expanded={isExpanded(accordion, article.slug, searching)}
              onToggle={() => setAccordion((state) => toggleRow(state, article.slug, searching))}
              highlight={searching ? query : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}
