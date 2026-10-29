import type { Metadata } from "next";
import { Suspense } from "react";
import { getDocumentationSummaries } from "@/modules/documentation/application/getDocumentationDataset";
import { DocumentationAdminList } from "@/modules/admin/documentation/DocumentationAdminList";

export const metadata: Metadata = { title: "Documentation" };

/** The Documentation list behind "Administrate" (decision 3 of 2026-10-19), read-only until the native editor arrives. */
export default async function AdminDocumentationListPage() {
  const articles = await getDocumentationSummaries();
  return (
    <Suspense>
      <DocumentationAdminList
        articles={articles.map((article) => ({
          id: article.slug,
          title: article.title,
          slug: article.slug,
          displayOrder: article.displayOrder,
          expertise: article.expertise,
          publishedAt: article.publishedAt.toISOString(),
          updatedAt: article.updatedAt.toISOString(),
        }))}
      />
    </Suspense>
  );
}
