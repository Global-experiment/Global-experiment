import type { Metadata } from "next";
import { SetPasswordForm } from "@/modules/admin/auth/SetPasswordForm";

export const metadata: Metadata = { title: "Welcome", referrer: "no-referrer" };

/** An invitation link (/admin/welcome#token): the invitee sets their password. No session needed. */
export default function AdminWelcomePage() {
  return <SetPasswordForm purpose="invite" />;
}
