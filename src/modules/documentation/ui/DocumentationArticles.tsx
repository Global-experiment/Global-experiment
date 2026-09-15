import { listPublishedArticles } from "@/modules/documentation/application/listPublishedArticles";
import { DocumentationList } from "./DocumentationList";

/**
 * Isolated as its own async component so only the index page's list can be
 * wrapped in Suspense (see documentation/page.tsx). The [slug] article page
 * deliberately has no Suspense boundary of its own — see
 * docs/architecture/decisions/007-error-boundary-not-found-status.md for
 * why that would silently break its 404 status.
 */
export async function DocumentationArticles() {
  const articles = await listPublishedArticles();
  return <DocumentationList articles={articles} />;
}
