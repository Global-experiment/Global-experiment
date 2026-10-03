import { headers } from "next/headers";
import { connection } from "next/server";
import { adminApiOrigin } from "@/shared/config/adminApi";
import type { AdminPrincipal } from "./types";

export type AdminSessionResult =
  | { status: "signed-in"; admin: AdminPrincipal }
  | { status: "signed-out" }
  | { status: "unavailable" };

/**
 * Asks the API who is signed in, forwarding the visitor's own cookies.
 * Next.js holds no auth logic of its own: the NestJS session (and its
 * expiry/revocation rules) is the only source of truth.
 */
export async function getAdminSession(): Promise<AdminSessionResult> {
  // Always per request: an admin page must never be prerendered with a
  // build-time answer (e.g. "unavailable" when ADMIN_API_ORIGIN is unset at build).
  await connection();
  const origin = adminApiOrigin();
  if (!origin) return { status: "unavailable" };
  const cookie = (await headers()).get("cookie");
  try {
    const response = await fetch(`${origin}/api/admin/auth/session`, {
      headers: { accept: "application/json", ...(cookie ? { cookie } : {}) },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (response.status === 401) return { status: "signed-out" };
    if (!response.ok) return { status: "unavailable" };
    const body = (await response.json()) as { admin: AdminPrincipal };
    return { status: "signed-in", admin: body.admin };
  } catch {
    return { status: "unavailable" };
  }
}
