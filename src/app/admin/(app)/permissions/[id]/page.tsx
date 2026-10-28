import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { GrantRecord } from "@/modules/admin/services/GrantRecord";

export const metadata: Metadata = { title: "Permission" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A permission, or /admin/permissions/new (prefilled with ?service= or ?person=). */
export default async function AdminPermissionPage({ params }: PageProps<"/admin/permissions/[id]">) {
  const { id } = await params;
  if (id !== "new" && !UUID.test(id)) notFound();
  return (
    <Suspense>
      <GrantRecord id={id} />
    </Suspense>
  );
}
