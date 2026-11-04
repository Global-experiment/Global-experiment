import type { Metadata } from "next";
import { VersionsScreen } from "@/modules/admin/cms/VersionsScreen";

export const metadata: Metadata = { title: "Versions" };

/** Every version of Home: view, compare, restore (OPS-28). */
export default function AdminHomeVersionsPage() {
  return <VersionsScreen home />;
}
