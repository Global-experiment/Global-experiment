import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CsvReportScreen } from "@/modules/admin/imports/CsvReportScreen";

export const metadata: Metadata = { title: "Import report" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AdminCsvReportPage({ params }: PageProps<"/admin/imports/csv/[id]">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  return <CsvReportScreen id={id} />;
}
