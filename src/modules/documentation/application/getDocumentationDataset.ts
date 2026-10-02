import { unstable_cache } from "next/cache";
import { getDocumentationRepository } from "@/modules/documentation/infrastructure/getDocumentationRepository";
import type { DocumentationArticle } from "@/modules/documentation/domain/types";

/**
 * The one place the Documentation UI's data comes from: every published
 * article with its full body, tags and publish metadata — everything the
 * index, search, accordion expansion, the standalone article route and the
 * history route need, already normalized into `DocumentationArticle`
 * (nothing Notion-shaped reaches a component). See
 * docs/architecture/decisions/003-notion-temporary-adapter.md — this is the
 * seam a future Postgres-backed repository replaces, with this function's
 * signature unchanged.
 *
 * Wrapped in `unstable_cache` so the ~11 Notion requests behind a full
 * dataset load happen at most once per revalidation window, not once per
 * request: concurrent requests during that window share one in-flight
 * fetch, and a request after the window elapses gets the stale dataset
 * immediately while Next refreshes it in the background (and keeps serving
 * the stale value if that refresh fails — ADR 009's "edits appear quickly"
 * intent survives as "within `REVALIDATE_SECONDS`", not instantly).
 *
 * `unstable_cache` persists its return value as JSON, which would silently
 * turn `publishedAt` into a plain string on every cache hit — serialized
 * here and rehydrated back into a real `Date` outside the cached function so
 * callers keep getting a `DocumentationArticle` exactly as the type says.
 */
const REVALIDATE_SECONDS = 60;

export const DOCUMENTATION_CACHE_TAG = "documentation";

type SerializedArticle = Omit<DocumentationArticle, "publishedAt" | "updatedAt"> & {
  publishedAt: string;
  updatedAt: string;
};

const getCachedDataset = unstable_cache(
  async (): Promise<SerializedArticle[]> => {
    const articles = await getDocumentationRepository().listPublishedWithContent();
    return articles.map((article) => ({
      ...article,
      publishedAt: article.publishedAt.toISOString(),
      updatedAt: article.updatedAt.toISOString(),
    }));
  },
  // Bump the version whenever SerializedArticle's shape changes, so entries
  // persisted in the data cache by an older build are never read back.
  ["documentation-dataset", "v2"],
  { revalidate: REVALIDATE_SECONDS, tags: [DOCUMENTATION_CACHE_TAG] },
);

export async function getDocumentationDataset(): Promise<DocumentationArticle[]> {
  const articles = await getCachedDataset();
  return articles.map((article) => ({
    ...article,
    publishedAt: new Date(article.publishedAt),
    updatedAt: new Date(article.updatedAt),
  }));
}
