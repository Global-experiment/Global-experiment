import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ImportCsvScreen } from "@/modules/admin/imports/ImportCsvScreen";

export const metadata: Metadata = { title: "Import CSV" };

/** /admin/imports/csv?table=people|organizations — the only tables with an import. */
export default async function AdminImportCsvPage({ searchParams }: PageProps<"/admin/imports/csv">) {
  const { table } = await searchParams;
  if (table !== "people" && table !== "organizations") notFound();
  return <ImportCsvScreen table={table} />;
}
