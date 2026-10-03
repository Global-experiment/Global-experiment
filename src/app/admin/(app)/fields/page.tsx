import type { Metadata } from "next";
import { TaxonomyScreen } from "@/modules/admin/expertise/TaxonomyScreen";

export const metadata: Metadata = { title: "Fields" };

export default function AdminFieldsPage() {
  return <TaxonomyScreen level="field" />;
}
