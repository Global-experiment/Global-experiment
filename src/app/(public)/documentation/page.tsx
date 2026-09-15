import type { Metadata } from "next";
import { Container } from "@/shared/ui/Container";
import { NavHeader } from "@/shared/ui/NavHeader";
import { listPublishedArticles } from "@/modules/documentation/application/listPublishedArticles";
import { DocumentationList } from "@/modules/documentation/ui/DocumentationList";

// Forces request-time rendering instead of build-time static generation.
// Without this, `next build` would statically bake in whatever the
// repository returns at build time (fixture data, if Notion isn't
// configured in the build environment) and serve that same stale HTML in
// production for up to a year — defeating the production fixture-safety
// guarantee in getDocumentationRepository().
//
// Deliberately no Suspense/loading.tsx boundary here either: streaming
// commits the HTTP response status before an async boundary resolves, so
// a thrown error (e.g. the production fixture-safety check) would report
// 200 instead of a real error status — the same root cause documented in
// ADR 007 for notFound(). The fetch is small (≤10 articles); a brief
// unstyled wait is preferable to a wrong status code.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Documentation — Global Experiment",
};

export default async function DocumentationIndexPage() {
  const articles = await listPublishedArticles();

  return (
    <main className="flex flex-1 flex-col">
      <NavHeader title="Documentation" backHref="/" />
      <Container className="flex flex-col gap-6 py-6">
        <div>
          <h1 className="text-base font-bold text-text-primary">Documentation</h1>
          <p className="mt-1 text-sm text-text-secondary">
            This page gathers the published articles explaining the experiment&rsquo;s purpose,
            current release, administration, finances, privacy, technology, and future direction.
          </p>
        </div>

        <DocumentationList articles={articles} />
      </Container>
    </main>
  );
}
