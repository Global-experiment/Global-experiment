"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { adminApi, endSession } from "../api/client";
import { adminDisplayName, type AdminPrincipal } from "../api/types";
import { setPreferredTimeZone } from "@/shared/format/Timestamp";
import { applyAppearance } from "@/shared/ui/appearance";
import { activeModuleKey, ADMIN_MODULES, filterModules, modulesFor } from "../registry";
import { AdminSessionProvider } from "../session";
import { AccountAvatar } from "./AccountAvatar";
import { focusRing } from "./controls";
import { rememberSidebar } from "./sidebarPrefs";
import { useRememberAdminPage } from "../record/navigationMemory";
import { ToastProvider } from "./Toast";
import styles from "./AdminShell.module.css";

// Sidebar and row padding move together to keep the menu glyphs on the same axis.
const paddingTransition = "transition-[padding] duration-150 motion-reduce:transition-none";

/** The signed-in frame keeps the sidebar controls, destinations, and profile independently of page scrolling. */
export function AdminShell({ admin, initialCollapsed = false, children }: { admin: AdminPrincipal; initialCollapsed?: boolean; children: ReactNode }) {
  const pathname = usePathname();
  useRememberAdminPage(pathname);
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const searchRef = useRef<HTMLInputElement>(null);
  const menu = useMemo(() => modulesFor(ADMIN_MODULES, new Set(admin.permissions)), [admin.permissions]);
  // A collapsed rail shows every item: the search only filters the full menu.
  const destinations = filterModules(menu, collapsed ? "" : query);
  const activeKey = activeModuleKey(menu, pathname);

  useEffect(() => applyAppearance(admin.appearance), [admin.appearance]);
  useEffect(() => setPreferredTimeZone(admin.timeZone), [admin.timeZone]);

  const setMenu = (next: boolean) => {
    setCollapsed(next);
    rememberSidebar(next);
  };

  return (
    <AdminSessionProvider admin={admin}>
      <div
        data-admin
        data-sidebar={collapsed ? "collapsed" : "expanded"}
        className={`${styles.shell} grid h-dvh overflow-hidden bg-surface-base font-normal text-text-primary transition-[grid-template-columns] duration-150 motion-reduce:transition-none`}
      >
        <ToastProvider>
          <div
            id="admin-sidebar"
            className={`relative z-10 flex h-dvh min-h-0 flex-col gap-4 py-2 font-medium shadow-[inset_-1px_0_0_var(--color-line)] ${collapsed ? "px-1" : "px-2"} ${paddingTransition}`}
          >
            <div className="flex shrink-0 flex-col gap-2">
              {collapsed ? (
                <button
                  type="button"
                  onClick={() => {
                    setMenu(false);
                    requestAnimationFrame(() => searchRef.current?.focus());
                  }}
                  aria-label="Search the menu"
                  title="Search the menu"
                  className={`flex h-8 cursor-pointer items-center rounded-control pl-2 text-text-muted hover:bg-surface-hover hover:text-text-primary ${focusRing}`}
                >
                  <SidebarIcon name="search" />
                </button>
              ) : (
                <label className="flex h-8 items-center gap-1 rounded-control pr-1 pl-2 inset-ring-1 inset-ring-line focus-within:inset-ring-text-primary">
                  <SidebarIcon name="search" />
                  <span className="sr-only">Search the menu</span>
                  <input
                    ref={searchRef}
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") setQuery("");
                    }}
                    placeholder="Search"
                    autoComplete="off"
                    spellCheck={false}
                    className="h-full min-w-0 flex-1 bg-transparent text-body text-text-primary outline-none placeholder:text-text-muted [&::-webkit-search-cancel-button]:hidden"
                  />
                </label>
              )}
              <button
                type="button"
                onClick={() => setMenu(!collapsed)}
                aria-controls="admin-sidebar"
                aria-expanded={!collapsed}
                aria-label={collapsed ? "Expand menu" : "Collapse menu"}
                title={collapsed ? "Expand menu" : "Collapse menu"}
                data-sidebar-toggle
                className={`flex h-6 cursor-pointer items-center gap-1 rounded-control pr-1 text-meta/4 font-bold text-text-muted hover:bg-surface-hover hover:text-text-primary ${collapsed ? "pl-2" : "pl-1"} ${paddingTransition} ${focusRing}`}
              >
                <SidebarIcon name={collapsed ? "expand" : "collapse"} />
                {collapsed ? null : <span className="truncate">Collapse menu</span>}
              </button>
            </div>

            <nav aria-label="Admin" className={`min-h-0 flex-1 overflow-y-auto overscroll-contain ${collapsed ? "[scrollbar-width:none]" : ""}`}>
              {destinations.length === 0 ? (
                <p role="status" className={collapsed ? "sr-only" : "px-1 text-body text-text-muted"}>
                  {query.trim() && !collapsed ? "No menu items match." : "No menu items available."}
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {destinations.map((item) => {
                    const active = item.key === activeKey;
                    return (
                      <li
                        key={item.key}
                        data-module={item.key}
                        data-public-menu={item.publicPage || undefined}
                        className={item.publicPage ? "[&+[data-public-menu]]:-mt-1" : undefined}
                      >
                        <Link
                          href={item.href}
                          aria-current={active ? "page" : undefined}
                          title={collapsed ? item.label : undefined}
                          className={`flex h-8 items-center gap-1 rounded-control pr-1 text-body ${collapsed ? "pl-2" : "pl-1"} ${active ? "bg-surface-raised text-text-primary" : "text-text-muted hover:bg-surface-hover hover:text-text-primary"} ${paddingTransition} ${focusRing}`}
                        >
                          <SidebarIcon name={item.icon} />
                          <span className={collapsed ? "sr-only" : "truncate"}>{item.label}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </nav>

            <UserCard admin={admin} collapsed={collapsed} />
          </div>
          <div data-admin-content className="relative h-dvh min-w-0 overflow-x-hidden overflow-y-auto overscroll-x-none">
            {children}
          </div>
        </ToastProvider>
      </div>
    </AdminSessionProvider>
  );
}

function SidebarIcon({ name }: { name: string }) {
  return <span aria-hidden="true" data-sidebar-icon={name} className={`${styles.icon} size-4 shrink-0 bg-current mask-no-repeat`} />;
}

function UserCard({ admin, collapsed }: { admin: AdminPrincipal; collapsed: boolean }) {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const name = adminDisplayName(admin);

  async function logout() {
    setPending(true);
    setFailed(false);
    try {
      await endSession(() => adminApi("/auth/logout", { method: "POST" }));
    } catch {
      setPending(false);
      setFailed(true);
    }
  }

  return (
    <div className="shrink-0">
      <div className="relative flex h-16 items-center rounded-control inset-ring-1 inset-ring-line">
        <Link
          href="/admin/profile"
          title={collapsed ? `${name} — profile` : "Profile"}
          className={`flex h-full min-w-0 flex-1 items-center gap-2 rounded-control text-body text-text-muted hover:text-text-primary ${collapsed ? "pl-1" : "mr-7 pl-2"} ${paddingTransition} ${focusRing}`}
        >
          {admin.hasPicture ? (
            <AccountAvatar id={admin.id} hasPicture />
          ) : collapsed ? (
            <span aria-hidden="true" className="flex size-6 shrink-0 items-center justify-center rounded-full text-text-primary inset-ring-1 inset-ring-line">
              {Array.from(name)[0]}
            </span>
          ) : null}
          <span data-user-name className={collapsed ? "sr-only" : "truncate"}>
            {name}
          </span>
        </Link>
        <button
          type="button"
          onClick={logout}
          disabled={pending}
          inert={collapsed}
          aria-label={pending ? "Signing out…" : "Sign out"}
          title="Sign out"
          className={`absolute right-1 flex size-6 cursor-pointer items-center justify-center rounded-control text-text-muted hover:text-text-primary disabled:cursor-wait ${collapsed ? "invisible opacity-0" : "motion-safe:transition-opacity motion-safe:delay-75"} ${focusRing}`}
        >
          <SidebarIcon name="sign-out" />
        </button>
      </div>
      {failed ? (
        <p role="alert" className={collapsed ? "sr-only" : "mt-1 px-1 text-meta text-text-primary"}>
          Couldn&rsquo;t sign out. Please try again.
        </p>
      ) : null}
    </div>
  );
}
