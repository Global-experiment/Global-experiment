import { Container } from "@/shared/ui/Container";
import { NavHeader } from "@/shared/ui/NavHeader";
import { Icon } from "@/shared/ui/icons";

const SKELETON_ROW_COUNT = 6;

/**
 * Shown while getDocumentationDataset() resolves (Suspense fallback for the
 * index route — client feedback item: "professional loading experience",
 * not a blank screen or a bare "Loading..." string). The header, search
 * affordance, heading and intro are static copy already known without any
 * data, so they render for real here, not as a skeleton — only the article
 * rows (genuinely unknown until the dataset loads) are placeholders, sized
 * to the real 40px row height so nothing jumps once content arrives.
 *
 * Trade-off worth naming: the Documentation index previously had no
 * Suspense boundary at all, specifically so a thrown error reported a real
 * HTTP status instead of 200 (ADR 007). This file reopens that gap, but
 * only for the index — it lives in the (index) route group precisely so
 * sibling routes ([slug], [slug]/history) do NOT inherit it and keep their
 * exact HTTP status (notFound() still reports a real 404 — see the
 * "nonexistent slug" E2E test). The remaining gap is one narrow case: the
 * dataset's very first-ever population failing at the exact moment a
 * request streams in, which the dataset cache (getDocumentationDataset)
 * makes rare in practice; documentation/error.tsx still exists for the
 * error itself, just under a 200 instead of a 500 in that one case.
 */
export default function DocumentationLoading() {
  return (
    <main className="flex flex-1 flex-col pb-6" aria-busy="true">
      <NavHeader title="Documentation" backHref="/" />
      <Container className="pt-1">
        <div className="relative">
          <Icon
            name="search"
            className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-text-muted"
          />
          <div className="h-8 w-full rounded-control border border-line bg-transparent pl-8 text-body text-text-muted" />
        </div>

        <h2 className="mt-2 text-lead font-bold text-text-primary">Documentation</h2>
        <p className="mt-1 text-lead text-text-primary">
          This page gathers the published articles explaining the experiment&rsquo;s purpose,
          current release, administration, finances, privacy, technology, and future direction.
        </p>

        <span role="status" className="sr-only">
          Loading documentation…
        </span>

        <div className="mt-2" aria-hidden="true">
          {Array.from({ length: SKELETON_ROW_COUNT }).map((_, index) => (
            <div key={index} className="flex h-10 items-center justify-between border-b border-line">
              <div
                className="h-3 animate-pulse rounded-control bg-text-muted/20"
                style={{ width: `${45 + ((index * 13) % 35)}%` }}
              />
              <Icon name="expand_more" className="shrink-0 text-text-muted/40" />
            </div>
          ))}
        </div>
      </Container>
    </main>
  );
}
