import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { DocumentRecord } from "@/modules/admin/cms/DocumentRecord";

export const metadata: Metadata = { title: "Document" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A Documentation article's record (admin-desktop.pdf p10). */
export default async function AdminDocumentPage({ params }: PageProps<"/admin/documentation/[id]">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  return (
    <Suspense>
      <DocumentRecord id={id} />
    </Suspense>
  );
}
