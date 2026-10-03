import type { Metadata } from "next";
import { TaxonomyScreen } from "@/modules/admin/expertise/TaxonomyScreen";

export const metadata: Metadata = { title: "Expertise" };

export default function AdminExpertisePage() {
  return <TaxonomyScreen level="expertise" />;
}
