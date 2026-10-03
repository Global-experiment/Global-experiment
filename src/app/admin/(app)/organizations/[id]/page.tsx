import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OrganizationRecord } from "@/modules/admin/organizations/OrganizationRecord";

export const metadata: Metadata = { title: "Organization" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AdminOrganizationPage({ params }: PageProps<"/admin/organizations/[id]">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  return <OrganizationRecord id={id} />;
}
