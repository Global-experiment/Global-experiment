import type { Metadata } from "next";
import { Suspense } from "react";
import { GrantsList } from "@/modules/admin/services/GrantsList";

export const metadata: Metadata = { title: "Permissions" };

export default function AdminPermissionsPage() {
  return (
    <Suspense>
      <GrantsList />
    </Suspense>
  );
}
