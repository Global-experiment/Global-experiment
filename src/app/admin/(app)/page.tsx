import { redirect } from "next/navigation";
import { getAdminSession } from "@/modules/admin/api/server";

/** People by default; an account with no role yet (made from an invitation link, OPS-141) has only its profile. */
export default async function AdminIndexPage() {
  const session = await getAdminSession();
  redirect(session.status === "signed-in" && session.admin.permissions.length === 0 ? "/admin/profile" : "/admin/people");
}
