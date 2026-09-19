"use client";

import { useId, useState } from "react";
import Link from "next/link";
import type { DocumentationArticle, DocumentationArticleSummary } from "@/modules/documentation/domain/types";
import { ShareButton } from "@/shared/ui/ShareButton";
import { Tag } from "@/shared/ui/Tag";
import { Icon } from "@/shared/ui/icons";
import { ArticleActions } from "./ArticleActions";
import { DocumentationContent } from "./DocumentationContent";
import { formatPublishedAt } from "./formatPublishedAt";

type LoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "loaded"; article: DocumentationArticle }
  | { status: "error" };

/**
 * One 40px accordion row (figma.pdf p15). Expanding reveals the full
 * article inline — metadata row, expertise tags, body, feedback/issue
 * actions — loaded on demand from /api/documentation/[slug] (live Notion,
 * fetched once per expansion session, never bundled with the index). The
 * permanent article page stays reachable through the "Published" link and
 * the share control.
 */
export function ArticleAccordionItem({ article }: { article: DocumentationArticleSummary }) {
  const [expanded, setExpanded] = useState(false);
  const [state, setState] = useState<LoadState>({ status: "idle" });
  const panelId = useId();
  const articleHref = `/documentation/${article.slug}`;

  async function load() {
    setState({ status: "loading" });
    try {
      const response = await fetch(`/api/documentation/${article.slug}`, { cache: "no-store" });
      if (!response.ok) throw new Error(String(response.status));
      const body = (await response.json()) as { article: Omit<DocumentationArticle, "publishedAt"> & { publishedAt: string } };
      setState({
        status: "loaded",
        article: { ...body.article, publishedAt: new Date(body.article.publishedAt) },
      });
    } catch {
      setState({ status: "error" });
    }
  }

  function toggle() {
    const next = !expanded;
    setExpanded(next);
    if (next && state.status === "idle") void load();
  }

  return (
    <div>
      <h2 className="text-body font-bold text-text-primary">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={expanded}
          aria-controls={panelId}
          className="-mr-1 flex h-10 w-full items-center justify-between gap-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
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
          {state.status === "loading" ? (
            <p role="status" className="text-body text-text-muted">
              Loading…
            </p>
          ) : null}
          {state.status === "error" ? (
            <p role="alert" className="text-body text-text-muted">
              This article couldn&rsquo;t be loaded.{" "}
              <button type="button" onClick={() => void load()} className="underline underline-offset-2">
                Try again
              </button>
            </p>
          ) : null}
          {state.status === "loaded" ? (
            <>
              <DocumentationContent blocks={state.article.content} headingLevelOffset={1} />
              <ArticleActions className="mt-5" />
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
