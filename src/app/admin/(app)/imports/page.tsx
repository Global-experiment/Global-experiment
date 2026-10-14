import type { Metadata } from "next";
import { ImportsScreen } from "@/modules/admin/imports/ImportsScreen";

export const metadata: Metadata = { title: "Notion import" };

export default function AdminImportsPage() {
  return <ImportsScreen />;
}
