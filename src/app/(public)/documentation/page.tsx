import type { Metadata } from "next";
import { Suspense } from "react";
import { Container } from "@/shared/ui/Container";
import { NavHeader } from "@/shared/ui/NavHeader";
import { LoadingState } from "@/shared/ui/LoadingState";
import { DocumentationArticles } from "@/modules/documentation/ui/DocumentationArticles";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Documentation — Global Experiment",
};

export default function DocumentationIndexPage() {
  return (
    <main className="flex flex-1 flex-col">
      <NavHeader title="Documentation" backHref="/" />
      <Container className="py-6">
        <Suspense fallback={<LoadingState label="Loading documentation" />}>
          <DocumentationArticles />
        </Suspense>
      </Container>
    </main>
  );
}
