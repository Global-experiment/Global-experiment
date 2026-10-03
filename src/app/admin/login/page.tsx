import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/modules/admin/auth/LoginForm";
import { safeAdminNext } from "@/modules/admin/api/paths";
import { getAdminSession } from "@/modules/admin/api/server";

export const metadata: Metadata = { title: "Sign in" };

export default async function AdminLoginPage({ searchParams }: PageProps<"/admin/login">) {
  const { next } = await searchParams;
  const nextPath = typeof next === "string" ? next : undefined;
  const session = await getAdminSession();
  if (session.status === "signed-in") redirect(safeAdminNext(nextPath));
  return <LoginForm next={nextPath} />;
}
