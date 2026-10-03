import type { Metadata } from "next";
import { Suspense } from "react";
import { OrganizationsList } from "@/modules/admin/organizations/OrganizationsList";

export const metadata: Metadata = { title: "Organizations" };

export default function AdminOrganizationsPage() {
  return (
    <Suspense>
      <OrganizationsList />
    </Suspense>
  );
}
