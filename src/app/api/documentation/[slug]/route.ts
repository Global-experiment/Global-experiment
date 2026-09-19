import { NextResponse } from "next/server";
import { getArticleBySlug } from "@/modules/documentation/application/getArticleBySlug";
import { logger } from "@/shared/logging/logger";

// Live Notion on every call — no route or data cache — so an edit in Notion
// shows the next time an article is expanded on the index.
export const dynamic = "force-dynamic";

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,127}$/;

/**
 * Serves one published article (application-owned shape, no CMS concepts)
 * to the Documentation index, which loads article bodies on demand when a
 * row is expanded (figma.pdf p15) instead of fetching all ten up front.
 *
 * Goes through the same application service as the article route, so the
 * Notion → mapper → repository → application boundary is unchanged.
 * Errors are reported by status only; no message, payload or stack ever
 * leaves the server.
 */
export async function GET(_request: Request, { params }: RouteContext<"/api/documentation/[slug]">) {
  const { slug } = await params;
  if (!SLUG_PATTERN.test(slug)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  try {
    const article = await getArticleBySlug(slug);
    if (!article) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ article }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logger.error("Documentation article API failed", {
      slug,
      errorName: error instanceof Error ? error.name : typeof error,
    });
    return NextResponse.json({ error: "unavailable" }, { status: 500 });
  }
}
