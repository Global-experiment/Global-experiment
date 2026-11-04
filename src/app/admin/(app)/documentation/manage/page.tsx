import type { Metadata } from "next";
import { Suspense } from "react";
import { DocumentationAdminList } from "@/modules/admin/documentation/DocumentationAdminList";

export const metadata: Metadata = { title: "Documentation" };

/** The Documentation list behind "Administrate" (admin-desktop.pdf p9): every article, drafts included. */
export default function AdminDocumentationListPage() {
  return (
    <Suspense>
      <DocumentationAdminList />
    </Suspense>
  );
}
