"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { AdminPrincipal } from "./api/types";

interface AdminSession {
  admin: AdminPrincipal;
  permissions: ReadonlySet<string>;
}

const SessionContext = createContext<AdminSession | null>(null);

/**
 * The signed-in admin and what their role allows (`module.action` keys from
 * the session), for every admin screen. The UI only hides what a role can't
 * do; the API checks every request on its own (PermissionGuard).
 */
export function AdminSessionProvider({ admin, children }: { admin: AdminPrincipal; children: ReactNode }) {
  const value = useMemo(() => ({ admin, permissions: new Set(admin.permissions) }), [admin]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useAdmin(): AdminPrincipal {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useAdmin outside AdminSessionProvider");
  return session.admin;
}

/** All of the signed-in role's permissions, for checks inside a loop. */
export function usePermissions(): ReadonlySet<string> | null {
  return useContext(SessionContext)?.permissions ?? null;
}

/** Whether the signed-in role has this permission (e.g. "services.create"). */
export function useCan(permission: string): boolean {
  const session = useContext(SessionContext);
  // Outside the shell (unit tests of a lone component): everything shows, the API still decides.
  return session ? session.permissions.has(permission) : true;
}
