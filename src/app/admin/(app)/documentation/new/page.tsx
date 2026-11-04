import type { Metadata } from "next";
import { Suspense } from "react";
import { DocumentRecord } from "@/modules/admin/cms/DocumentRecord";

export const metadata: Metadata = { title: "New document" };

/** A new Documentation article (cms.create); `?from=<id>` prefills it ("Duplicate as a draft", p11). */
export default function AdminNewDocumentPage() {
  return (
    <Suspense>
      <DocumentRecord id={null} />
    </Suspense>
  );
}
