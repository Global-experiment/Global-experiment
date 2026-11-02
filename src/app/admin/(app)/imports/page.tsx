import type { Metadata } from "next";
import { ImportsScreen } from "@/modules/admin/imports/ImportsScreen";

export const metadata: Metadata = { title: "Imports" };

export default function AdminImportsPage() {
  return <ImportsScreen />;
}
