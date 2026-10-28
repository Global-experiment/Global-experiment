import type { Metadata } from "next";
import { SetPasswordForm } from "@/modules/admin/auth/SetPasswordForm";

export const metadata: Metadata = { title: "Reset password", referrer: "no-referrer" };

/** A password reset link (/admin/reset-password#token), made by a Rootadmin. No session needed. */
export default function AdminResetPasswordPage() {
  return <SetPasswordForm purpose="reset" />;
}
