import type { Metadata } from "next";
import { TaxonomyScreen } from "@/modules/admin/expertise/TaxonomyScreen";

export const metadata: Metadata = { title: "Domains" };

export default function AdminDomainsPage() {
  return <TaxonomyScreen level="domain" />;
}
