import type { Metadata } from "next";
import { getDocumentationDataset, getDocumentationSummaries } from "@/modules/documentation/application/getDocumentationDataset";
import { DocumentationList } from "@/modules/documentation/ui/DocumentationList";
import { PublicPageHeader } from "@/modules/admin/ui/PublicPageHeader";
import { Container } from "@/shared/ui/Container";

export const metadata: Metadata = { title: "Documentation" };

/**
 * Documentation as visitors see it, inside the admin (admin-desktop.pdf p8,
 * whose title reads "Home" by mistake): the admin header, then the public
 * list without its search, each article with its own "Administrate".
 */
export default async function AdminDocumentationPage() {
  const content = getDocumentationDataset();
  content.catch(() => {});
  const articles = await getDocumentationSummaries();
  return (
    <div className="pb-6">
      <PublicPageHeader title="Documentation" administrateHref="/admin/documentation/manage" publicPath="/documentation" />
      <Container className="pt-1">
        <DocumentationList articles={articles} content={content} variant="admin">
          <h2 className="text-lead font-bold text-text-primary">Documentation</h2>
          <p className="mt-1 text-lead text-text-primary">
            This page gathers the published articles explaining the experiment&rsquo;s purpose, current release,
            administration, finances, privacy, technology, and future direction.
          </p>
        </DocumentationList>
      </Container>
    </div>
  );
}
