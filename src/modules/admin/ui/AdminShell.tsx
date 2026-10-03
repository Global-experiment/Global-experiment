"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { AdminIcon, type AdminIconName } from "./adminIcons";
import { focusRing } from "./controls";
import { ToastProvider } from "./Toast";

interface NavItem {
  label: string;
  icon: AdminIconName;
  /** Only modules that exist link anywhere; the rest are shown (Figma IA) but inert. */
  href?: string;
}

/** Sidebar sections and order exactly as figma.pdf p40. */
const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: "Content",
    items: [
      { label: "Home", icon: "home" },
      { label: "Documentation", icon: "insert_drive_file" },
    ],
  },
  {
    section: "Admin",
    items: [
      { label: "Feedbacks and issues", icon: "lightbulb" },
      { label: "Treasury", icon: "toll" },
      { label: "People", icon: "group", href: "/admin/people" },
      { label: "Organizations", icon: "corporate_fare", href: "/admin/organizations" },
    ],
  },
  {
    section: "Monitoring",
    items: [
      { label: "Services", icon: "services" },
      { label: "Access grants", icon: "lock" },
      { label: "Technical dashboard", icon: "technical_dashboard" },
      { label: "Analytics", icon: "analytics" },
    ],
  },
  {
    section: "Other",
    items: [
      { label: "Expertise", icon: "expertise", href: "/admin/expertise" },
      { label: "Fields", icon: "expertise", href: "/admin/fields" },
      { label: "Domains", icon: "expertise", href: "/admin/domains" },
      { label: "Profile", icon: "login", href: "/admin/profile" },
    ],
  },
];

/**
 * Desktop admin frame (figma.pdf p40): 240px sidebar with a 1px right
 * rule; 12px muted section labels 9px from the top, 34px item rows (16px
 * glyph at 8px, label at 28px), 13px between sections. The current item
 * is white, others muted. Text is Inter Regular (the admin frames use 400,
 * not the public site's 500); titles and buttons are bold. Desktop only.
 */
export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <ToastProvider>
      <div className="grid min-h-dvh min-w-[1024px] grid-cols-[240px_minmax(0,1fr)] bg-surface-base font-normal text-text-primary">
        <nav aria-label="Admin" className="sticky top-0 h-dvh overflow-y-auto border-r border-line pt-[9px]">
          {NAV.map(({ section, items }, index) => (
            <div key={section} className={index === 0 ? "" : "mt-[13px]"}>
              <p className="px-2 text-meta text-text-muted">{section}</p>
              <ul className="mt-[5px]">
                {items.map((item) => {
                  const active = item.href !== undefined && (pathname === item.href || pathname.startsWith(`${item.href}/`));
                  const content = (
                    <>
                      <AdminIcon name={item.icon} />
                      {item.label}
                    </>
                  );
                  const rowClasses = `flex h-[34px] items-center gap-1 px-2 text-body ${active ? "text-text-primary" : "text-text-muted"}`;
                  return (
                    <li key={item.label}>
                      {item.href ? (
                        <Link href={item.href} aria-current={active ? "page" : undefined} className={`${rowClasses} ${focusRing}`}>
                          {content}
                        </Link>
                      ) : (
                        <span aria-disabled="true" title="Not available in this version" className={rowClasses}>
                          {content}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
        <div className="min-w-0">{children}</div>
      </div>
    </ToastProvider>
  );
}
