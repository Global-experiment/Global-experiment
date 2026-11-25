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
import { AccountAvatar, accountPictureUrl } from "./AccountAvatar";
import { AdminIcon } from "./adminIcons";
import { focusRing, focusRingInset } from "./controls";
import { rememberSidebar } from "./sidebarPrefs";
import { useRememberAdminPage } from "../record/navigationMemory";
import { ToastProvider } from "./Toast";

// Sidebar and row padding move together to keep the menu glyphs on the same axis.
const paddingTransition = "transition-[padding] duration-150 motion-reduce:transition-none";

/**
 * Admin frame: the menu follows the Figma component "Desktop menu" (Design
 * system, page "1 Master"; client, 2026-11-24 and 25). Expanded, it is
 * 240px wide (`--spacing-sidebar`) with a 1px rule inside its right edge:
 * a 32px search box, "Collapse menu" below it, then one flat list of 32px
 * rows 8px apart (16px glyph, the current row on the raised fill), and the
 * 64px user card pinned to the bottom. Collapsed, it is a 40px rail
 * (`--spacing-sidebar-rail`): the glyphs keep their place, the names stay
 * as tooltips and for screen readers, and the search glyph re-opens the
 * menu with the search focused. The choice is remembered in a cookie
 * (sidebarPrefs.ts) so the server renders the right width from the first
 * paint.
 *
 * The rows come from the module registry (../registry.ts): only live
 * modules the signed-in role can read, no "Coming soon" rows (ADR 024).
 * Rows draw their focus ring inside, because the list scrolls and would
 * clip a ring drawn outside.
 *
 * Exactly one viewport tall (client, 2026-10-05): the page itself never
 * scrolls; the menu and the content column scroll on their own, and list
 * pages scroll only their table. Works from 1440 down to 1024px wide.
 * `data-admin` scopes the admin-only rules in globals.css, including the
 * menu width the toast follows. The signed-in account's appearance and
 * time zone (Profile settings, p18) apply to every page.
 */
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
        className="grid h-dvh grid-cols-[var(--admin-sidebar-width)_minmax(0,1fr)] overflow-hidden bg-surface-base font-normal text-text-primary transition-[grid-template-columns] duration-150 motion-reduce:transition-none"
      >
        <ToastProvider>
          <div
            id="admin-sidebar"
            className={`relative z-10 flex h-dvh min-h-0 flex-col gap-4 py-2 font-medium shadow-[inset_-1px_0_0_var(--color-line)] ${collapsed ? "px-1" : "px-2"} ${paddingTransition}`}
          >
            <div className="flex shrink-0 flex-col gap-2">
              <div
                className={`relative flex h-8 min-w-0 items-center gap-1 rounded-control pr-1 text-text-muted inset-ring-1 transition-[padding,box-shadow] duration-150 motion-reduce:transition-none ${collapsed ? "pl-2 inset-ring-transparent hover:bg-surface-hover" : "pl-1 inset-ring-line focus-within:inset-ring-text-primary"}`}
              >
                <AdminIcon name="search" />
                {collapsed ? (
                  <button
                    type="button"
                    onClick={() => {
                      setMenu(false);
                      requestAnimationFrame(() => searchRef.current?.focus({ preventScroll: true }));
                    }}
                    aria-label="Search the menu"
                    title="Search the menu"
                    className={`absolute inset-0 cursor-pointer rounded-control ${focusRing}`}
                  />
                ) : null}
                <input
                  ref={searchRef}
                  type="search"
                  aria-label="Search the menu"
                  aria-hidden={collapsed}
                  inert={collapsed}
                  tabIndex={collapsed ? -1 : 0}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") setQuery("");
                  }}
                  placeholder="Search"
                  autoComplete="off"
                  spellCheck={false}
                  className={`h-full min-w-0 flex-1 bg-transparent text-body text-text-primary outline-none transition-opacity duration-150 placeholder:text-text-muted motion-reduce:transition-none [&::-webkit-search-cancel-button]:hidden ${collapsed ? "opacity-0" : "opacity-100"}`}
                />
              </div>
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
                <AdminIcon name={collapsed ? "expand_menu" : "collapse_menu"} />
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
                      <li key={item.key} data-module={item.key}>
                        <Link
                          href={item.href}
                          aria-current={active ? "page" : undefined}
                          title={collapsed ? item.label : undefined}
                          className={`flex h-8 items-center gap-1 rounded-control pr-1 text-body ${collapsed ? "pl-2" : "pl-1"} ${active ? "bg-surface-raised text-text-primary" : "text-text-muted hover:bg-surface-hover hover:text-text-primary"} ${paddingTransition} ${focusRingInset}`}
                        >
                          <AdminIcon name={item.icon} />
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

/**
 * The user card of "Desktop menu" (client, 2026-11-24): a 64px outlined card.
 * Expanded: the profile picture, the name and Sign out at the right.
 * Collapsed: the picture only, no Sign out. Without a photo, the picture is
 * the first letter of the name (AccountAvatar). The card leads to Profile
 * settings.
 */
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
          <AccountAvatar name={name} picture={admin.hasPicture ? accountPictureUrl(admin.id) : null} />
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
          <AdminIcon name="login" />
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
