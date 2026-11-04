import type { Metadata } from "next";
import { HomeEditor } from "@/modules/admin/cms/HomeEditor";

export const metadata: Metadata = { title: "Home" };

/** Home's editor (admin-desktop.pdf p7), behind Administrate on Home (p6). */
export default function AdminHomeEditorPage() {
  return <HomeEditor />;
}
