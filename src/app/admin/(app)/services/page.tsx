import type { Metadata } from "next";
import { Suspense } from "react";
import { ServicesList } from "@/modules/admin/services/ServicesList";

export const metadata: Metadata = { title: "Services" };

export default function AdminServicesPage() {
  return (
    <Suspense>
      <ServicesList />
    </Suspense>
  );
}
