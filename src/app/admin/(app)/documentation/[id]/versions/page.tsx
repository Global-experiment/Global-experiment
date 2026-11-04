import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { VersionsScreen } from "@/modules/admin/cms/VersionsScreen";

export const metadata: Metadata = { title: "Versions" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Every version of an article: view, compare, restore (OPS-28). */
export default async function AdminDocumentVersionsPage({ params }: PageProps<"/admin/documentation/[id]/versions">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  return <VersionsScreen documentId={id} />;
}
