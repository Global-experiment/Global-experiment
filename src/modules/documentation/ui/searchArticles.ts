import type { DocumentationArticleSummary, DocumentationContentBlock } from "@/modules/documentation/domain/types";
import { richTextToPlain } from "@/shared/content/types";

/**
 * Flattens everything a visitor might search for into one lowercase string:
 * title, expertise tags, and the plain text of every heading/paragraph in
 * the body (client feedback item 15 — search must reach tags and full
 * article content, not just the title). Computed once per article by the
 * caller (see DocumentationList), not per keystroke. Without `content`
 * (bodies still streaming in) it covers title and tags only.
 */
export function buildSearchHaystack(
  article: DocumentationArticleSummary & { content?: DocumentationContentBlock[] },
): string {
  const bodyText = (article.content ?? [])
    .map((block) => (block.kind === "unsupported" ? "" : richTextToPlain(block.text)))
    .join(" ");
  return [article.title, ...article.expertise, bodyText].join(" ").toLowerCase();
}

/**
 * Filters articles by a haystack map built once (title/tags/body), never a
 * per-keystroke Notion query. Matching is a plain case-insensitive
 * substring test — intentionally simple, no ranking/fuzzy matching.
 */
export function searchArticles<T extends { slug: string }>(
  articles: readonly T[],
  haystacks: ReadonlyMap<string, string>,
  query: string,
): T[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return [...articles];
  return articles.filter((article) => (haystacks.get(article.slug) ?? "").includes(trimmed));
}
