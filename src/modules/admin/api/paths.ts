/** Admin URL helpers shared by server and client code. */

export function loginHref(next?: string): string {
  return next ? `/admin/login?next=${encodeURIComponent(next)}` : "/admin/login";
}

/** Only same-site admin paths are honoured as a post-login destination (no open redirect). */
export function safeAdminNext(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith("/admin") || raw.startsWith("//") || raw.includes("\\") || raw.startsWith("/admin/login")) {
    return "/admin/people";
  }
  return raw;
}
