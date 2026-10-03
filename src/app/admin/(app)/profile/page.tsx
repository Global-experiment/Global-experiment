import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/modules/admin/api/server";
import { ProfileScreen } from "@/modules/admin/auth/ProfileScreen";

export const metadata: Metadata = { title: "Profile" };

export default async function AdminProfilePage() {
  const session = await getAdminSession();
  if (session.status !== "signed-in") redirect("/admin/login");
  return <ProfileScreen admin={session.admin} />;
}
