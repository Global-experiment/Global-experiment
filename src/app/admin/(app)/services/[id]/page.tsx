import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ServiceRecord } from "@/modules/admin/services/ServiceRecord";

export const metadata: Metadata = { title: "Service" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AdminServicePage({ params }: PageProps<"/admin/services/[id]">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  return <ServiceRecord id={id} />;
}
