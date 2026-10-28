import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AccountRecord } from "@/modules/admin/accounts/AccountRecord";

export const metadata: Metadata = { title: "Account" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AdminAccountPage({ params }: PageProps<"/admin/accounts/[id]">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  return <AccountRecord id={id} />;
}
