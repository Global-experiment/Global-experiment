import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TreasuryRecord } from "@/modules/admin/treasury/TreasuryRecord";

export const metadata: Metadata = { title: "Treasury entry" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AdminTreasuryEntryPage({ params }: PageProps<"/admin/treasury/[id]">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  return <TreasuryRecord id={id} />;
}
