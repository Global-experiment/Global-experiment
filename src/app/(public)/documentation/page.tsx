import type { Metadata } from "next";
import { Container } from "@/shared/ui/Container";
import { NavHeader } from "@/shared/ui/NavHeader";
import { listPublishedArticles } from "@/modules/documentation/application/listPublishedArticles";
import { DocumentationList } from "@/modules/documentation/ui/DocumentationList";
import { DocumentationPageMenu } from "@/modules/documentation/ui/DocumentationPageMenu";

// Live Notion on every request — no route cache, no data cache — so edits
// in Notion show on the next refresh. Deliberately no Suspense/loading.tsx
// boundary either: streaming commits the HTTP status before an async
// boundary resolves, so a thrown error would report 200 instead of a real
// error status (ADR 007). The fetch is small (≤10 summaries).
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
  const articles = await listPublishedArticles();

  return (
    <main className="flex flex-1 flex-col pb-6">
      <NavHeader
        title="Documentation"
        backHref="/"
        actions={<DocumentationPageMenu url="/documentation" title="Documentation" />}
      />
      <Container className="pt-1">
        <DocumentationList articles={articles}>
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
