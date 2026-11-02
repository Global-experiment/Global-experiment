import type { Metadata } from "next";
import { JoinForm } from "@/modules/admin/auth/JoinForm";

export const metadata: Metadata = { title: "Join", referrer: "no-referrer" };

/** An invitation link (/admin/join#token, OPS-141): whoever opens it creates their own account. No session needed. */
export default function AdminJoinPage() {
  return <JoinForm />;
}
