import type { Metadata } from "next";
import { Container } from "@/shared/ui/Container";
import { NavHeader } from "@/shared/ui/NavHeader";
import {
  getDocumentationDataset,
  getDocumentationSummaries,
} from "@/modules/documentation/application/getDocumentationDataset";
import { DocumentationList } from "@/modules/documentation/ui/DocumentationList";
import { DocumentationPageMenu } from "@/modules/documentation/ui/DocumentationPageMenu";

// getDocumentationDataset() is cached server-side (unstable_cache, 60s
// revalidate — see that file), so this no longer hits Notion on every
// request; force-dynamic stays only so the route keeps rendering per
// request rather than being statically generated at build time, which
// would require Notion to be reachable during `next build`.
//
// loading.tsx now gives this route a Suspense boundary (see that file for
// the professional-loading-state rationale and the narrow ADR 007 trade-off
// it reopens).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Documentation — Global Experiment",
};

/**
 * figma.pdf p15 top to bottom: header row (back, title, share, overflow),
 * search, page heading, intro, accordion rows. No desktop-specific frame
 * exists for this page; it uses the same centered column as desktop Home.
 */
export default async function DocumentationIndexPage() {
  // Rows wait only for the one metadata query; bodies stream in behind them.
  // Both share the same 60s cache window, so warm loads resolve together.
  const content = getDocumentationDataset();
  // The client reports a body failure itself; this only keeps a rejection
  // from going unhandled if the summaries fail first and the page errors.
  content.catch(() => {});
  const articles = await getDocumentationSummaries();

  return (
    <main className="flex flex-1 flex-col pb-6">
      <NavHeader
        title="Documentation"
        backHref="/"
        actions={<DocumentationPageMenu url="/documentation" title="Documentation" />}
      />
      <Container className="pt-1">
        <DocumentationList articles={articles} content={content}>
          {/* NavHeader renders the page's <h1>; this is the in-page section heading from the design. */}
          <h2 className="mt-2 text-lead font-bold text-text-primary">Documentation</h2>
          <p className="mt-1 text-lead text-text-primary">
            This page gathers the published articles explaining the experiment&rsquo;s purpose,
            current release, administration, finances, privacy, technology, and future direction.
          </p>
        </DocumentationList>
      </Container>
    </main>
  );
}
