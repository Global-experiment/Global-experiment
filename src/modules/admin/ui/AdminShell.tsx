"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { adminApi } from "../api/client";
import { adminDisplayName, type AdminPrincipal } from "../api/types";
import { AdminIcon, type AdminIconName } from "./adminIcons";
import { focusRing } from "./controls";
import { ToastProvider } from "./Toast";

export interface NavItem {
  label: string;
  icon: AdminIconName;
  /** Only modules that exist link anywhere; the rest are listed (Figma IA) but disabled. */
  href?: string;
  /** Other paths that belong to this item (e.g. the Notion import page under People). */
  alsoActiveOn?: string[];
}

/**
 * Sidebar groups, order and glyphs exactly as admin-desktop.pdf p2 (the
 * History item uses the same lightbulb glyph Figma draws for it).
 */
export const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: "Communication",
    items: [
      { label: "Home", icon: "home" },
      { label: "Documentation", icon: "insert_drive_file" },
    ],
  },
  {
    section: "Admin",
    items: [
      { label: "Treasury", icon: "toll" },
      { label: "Feedbacks and issues", icon: "lightbulb" },
      { label: "People", icon: "group", href: "/admin/people", alsoActiveOn: ["/admin/imports"] },
      { label: "Messages", icon: "forum" },
    ],
  },
  {
    section: "Monitoring",
    items: [
      { label: "Analytics", icon: "analytics" },
      { label: "Emails", icon: "alternate_email" },
      { label: "History", icon: "lightbulb" },
      { label: "Technical dashboard", icon: "technical_dashboard" },
      { label: "Services", icon: "services" },
      { label: "Access grants", icon: "lock" },
      { label: "Accounts", icon: "manage_accounts" },
    ],
  },
  {
    section: "Other",
    items: [
      { label: "Expertise", icon: "view_column", href: "/admin/expertise" },
      { label: "Fields", icon: "view_column", href: "/admin/fields" },
      { label: "Domains", icon: "view_column", href: "/admin/domains" },
      { label: "Organizations", icon: "corporate_fare", href: "/admin/organizations" },
      { label: "Waitlist", icon: "approval" },
    ],
  },
];

/** The menu filtered by the sidebar search (case-insensitive, on the label); empty sections drop out. */
export function filterNav(nav: typeof NAV, query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return nav;
  return nav
    .map((group) => ({ ...group, items: group.items.filter((item) => item.label.toLowerCase().includes(needle)) }))
    .filter((group) => group.items.length > 0);
}

const isActive = (item: NavItem, pathname: string) =>
  [item.href, ...(item.alsoActiveOn ?? [])].some((path) => path !== undefined && (pathname === path || pathname.startsWith(`${path}/`)));

/**
 * Admin frame (admin-desktop.pdf p2, measured): a 240px sidebar with a 1px
 * #484848 rule — 32px search box 8px in; 40px section headers (12px muted
 * label on an 8px baseline gap); 224×32 item rows 4px apart (16px glyph
 * 4px in, label at 24px), muted, the current one white on a #1f1f1f
 * rounded fill; and a 64px user card pinned 8px above the bottom edge.
 * Items for modules that don't exist yet are listed but disabled
 * ("Coming soon"); none of them leads to a placeholder page.
 *
 * Exactly one viewport tall (client, 2026-10-05): the page itself never
 * scrolls; the menu and the content column scroll on their own, and list
 * pages scroll only their table. Works from 1440 down to 1024px wide: the
 * sidebar stays 240px, the content column takes the rest. `data-admin`
 * scopes the admin-only overscroll rules in globals.css.
 */
export function AdminShell({ admin, children }: { admin: AdminPrincipal; children: ReactNode }) {
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const groups = filterNav(NAV, query);

  return (
    <ToastProvider>
      <div data-admin className="grid h-dvh grid-cols-[240px_minmax(0,1fr)] overflow-hidden bg-surface-base font-normal text-text-primary">
        {/* The 1px rule sits on the column edge, outside its 240px (Figma), above the content. */}
        <div className="relative z-10 flex h-dvh min-h-0 flex-col shadow-[1px_0_0_0_var(--color-line)]">
          <div className="shrink-0 px-2 pt-2">
            <label className={`flex h-8 items-center gap-1 rounded-control pr-1 pl-2 ring-1 ring-line focus-within:ring-text-primary`}>
              <AdminIcon name="search" />
              <span className="sr-only">Search the menu</span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setQuery("");
                }}
                placeholder="Search"
                autoComplete="off"
                spellCheck={false}
                className="h-8 min-w-0 flex-1 bg-transparent text-body text-text-primary outline-none placeholder:text-text-muted [&::-webkit-search-cancel-button]:hidden"
              />
            </label>
          </div>

          <nav aria-label="Admin" className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2">
            {groups.length === 0 ? (
              <p role="status" className="px-2 pt-4 text-body text-text-muted">
                No menu items match.
              </p>
            ) : (
              groups.map(({ section, items }) => (
                <div key={section}>
                  <p className="flex h-10 items-end px-2 pb-2.5 text-meta text-text-muted">{section}</p>
                  <ul className="flex flex-col gap-1 px-2">
                    {items.map((item) => {
                      const active = isActive(item, pathname);
                      const content = (
                        <>
                          <AdminIcon name={item.icon} />
                          {item.label}
                        </>
                      );
                      const row = "flex h-8 items-center gap-1 rounded-control pl-1 text-body";
                      return (
                        <li key={item.label}>
                          {item.href ? (
                            <Link
                              href={item.href}
                              aria-current={active ? "page" : undefined}
                              className={`${row} ${active ? "bg-surface-raised text-text-primary" : "text-text-muted hover:text-text-primary"} ${focusRing}`}
                            >
                              {content}
                            </Link>
                          ) : (
                            <span aria-disabled="true" title="Coming soon" data-coming-soon className={`${row} cursor-not-allowed text-text-muted`}>
                              {content}
                              <span className="sr-only"> (coming soon)</span>
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))
            )}
          </nav>

          <UserCard admin={admin} />
        </div>
        <div data-admin-content className="relative h-dvh min-w-0 overflow-x-hidden overflow-y-auto overscroll-x-none">
          {children}
        </div>
      </div>
    </ToastProvider>
  );
}

/** admin-desktop.pdf p2: 64px card, 24px avatar disc, the name, and a sign-out button at the right. */
function UserCard({ admin }: { admin: AdminPrincipal }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const name = adminDisplayName(admin);

  async function logout() {
    setPending(true);
    setFailed(false);
    try {
      await adminApi("/auth/logout", { method: "POST" });
      router.replace("/admin/login");
    } catch {
      setPending(false);
      setFailed(true);
    }
  }

  return (
    <div className="shrink-0 px-2 pb-2">
      <div className="flex h-16 items-center gap-1 rounded-control pr-1 pl-2 ring-1 ring-line">
        <Link href="/admin/profile" title="Profile" className={`flex min-w-0 flex-1 items-center gap-1 rounded-control text-body text-text-muted hover:text-text-primary ${focusRing}`}>
          <span aria-hidden="true" className="size-6 shrink-0 rounded-full bg-avatar" />
          <span data-user-name className="truncate">
            {name}
          </span>
        </Link>
        <button
          type="button"
          onClick={logout}
          disabled={pending}
          aria-label={pending ? "Signing out…" : "Sign out"}
          title="Sign out"
          className={`flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-control text-text-muted hover:text-text-primary disabled:cursor-wait ${focusRing}`}
        >
          <AdminIcon name="login" />
        </button>
      </div>
      {failed ? (
        <p role="alert" className="mt-1 px-1 text-meta text-text-primary">
          Couldn&rsquo;t sign out. Please try again.
        </p>
      ) : null}
    </div>
  );
}
