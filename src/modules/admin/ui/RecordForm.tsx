"use client";

import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { AdminIcon, type AdminIconName } from "./adminIcons";
import { focusRing } from "./controls";

/**
 * Record pages have no Figma frame yet, so they reuse the People table's
 * vocabulary: the same 40px title row, the column type glyphs and labels
 * (muted, as in the table header), 14/18 text, 1px rules and 32px boxed
 * inputs from the toolbar. One property per row, label left, value right.
 */

export const recordInput = `h-8 w-full max-w-[480px] rounded-control bg-surface-base px-2 text-body text-text-primary ring-1 ring-line placeholder:text-text-muted ${focusRing}`;

export function RecordHeader({
  backHref,
  backLabel,
  title,
  actions,
}: {
  backHref: string;
  backLabel: string;
  title: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex h-10 items-center gap-2 px-2">
      <Link href={backHref} className={`text-body text-text-muted ${focusRing}`}>
        {backLabel}
      </Link>
      <span aria-hidden="true" className="text-text-muted">
        /
      </span>
      <h1 className="mr-auto min-w-0 truncate text-body font-bold">{title || "Untitled"}</h1>
      {actions}
    </header>
  );
}

export function PropertyRow({
  icon,
  label,
  htmlFor,
  error,
  children,
}: {
  icon: AdminIconName;
  label: string;
  htmlFor?: string;
  error?: string;
  children: ReactNode;
}) {
  const Label = htmlFor ? "label" : "span";
  return (
    <div className="grid grid-cols-[200px_minmax(0,1fr)] items-start gap-2 border-t border-line px-2 py-1">
      <Label {...(htmlFor ? { htmlFor } : {})} className="flex min-h-8 items-center gap-1 text-body text-text-muted">
        <AdminIcon name={icon} />
        {label}
      </Label>
      <div className="flex min-h-8 flex-col justify-center text-body">
        {children}
        {error ? (
          <p role="alert" className="mt-1 text-meta text-text-primary">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function RecordSelect({ children, ...rest }: ComponentProps<"select">) {
  return (
    <span className="relative inline-flex w-full max-w-[480px] items-center">
      <select className={`${recordInput} cursor-pointer appearance-none pr-7`} {...rest}>
        {children}
      </select>
      <AdminIcon name="arrow_drop_down" className="pointer-events-none absolute right-2" />
    </span>
  );
}
