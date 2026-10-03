"use client";

import Link from "next/link";
import {
  useEffect,
  useRef,
  type ComponentProps,
  type ReactNode,
  type RefObject,
  type SelectHTMLAttributes,
} from "react";
import { Icon } from "@/shared/ui/icons";
import { AdminIcon, type AdminIconName } from "./adminIcons";

/**
 * Admin control primitives measured on figma.pdf p40–p43. Strokes are
 * drawn OUTSIDE the box in Figma (a 24px button reads 26px with its 1px
 * stroke), so borders are 1px rings (box-shadow) that don't take layout
 * space; boxes keep Figma's inner sizes. 4px corners, 14px text.
 */

export const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary";

const buttonClasses = `inline-flex h-6 shrink-0 cursor-pointer items-center gap-2 rounded-control bg-surface-base px-2 text-body font-bold whitespace-nowrap text-text-primary ring-1 ring-line disabled:cursor-not-allowed disabled:text-text-muted ${focusRing}`;

type ButtonProps = ComponentProps<"button"> & { icon?: AdminIconName; leading?: ReactNode };

/** Header/footer action button (figma.pdf p40 "New people": 24px, icon 8px in, 8px gap). */
export function AdminButton({ icon, leading, children, className = "", type = "button", ...rest }: ButtonProps) {
  return (
    <button type={type} className={`${buttonClasses} ${className}`} {...rest}>
      {leading ?? (icon ? <AdminIcon name={icon} /> : null)}
      {children}
    </button>
  );
}

export function AdminButtonLink({ href, icon, children }: { href: string; icon?: AdminIconName; children: ReactNode }) {
  return (
    <Link href={href} className={buttonClasses}>
      {icon ? <AdminIcon name={icon} /> : null}
      {children}
    </Link>
  );
}

/** 32px toolbar control box (search, sort, filters — 160px wide in Figma). */
export const toolbarBox = `relative flex h-8 items-center rounded-control bg-surface-base ring-1 ring-line ${focusRing}`;

/**
 * Figma's filter/sort "chip" (p41: 24px, optional leading type icon,
 * trailing ▾) as a native <select> for keyboard and screen-reader support.
 */
export function ChipSelect({
  icon,
  className = "",
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { icon?: AdminIconName }) {
  return (
    <span className={`relative inline-flex h-6 shrink-0 items-center rounded-control ring-1 ring-line ${className}`}>
      {icon ? <AdminIcon name={icon} className="pointer-events-none absolute left-2" /> : null}
      <select
        className={`h-6 cursor-pointer appearance-none rounded-control bg-surface-base pr-6 text-body text-text-primary [field-sizing:content] ${icon ? "pl-7" : "pl-2"} ${focusRing}`}
        {...rest}
      >
        {children}
      </select>
      <AdminIcon name="arrow_drop_down" className="pointer-events-none absolute right-1" />
    </span>
  );
}

export const chipInput = `h-6 rounded-control bg-surface-base px-2 text-body text-text-primary ring-1 ring-line placeholder:text-text-muted ${focusRing}`;

/**
 * Column-menu checkbox (figma.pdf p40: 12px of ink at 418,240, i.e. the
 * 16px glyph frame at 416) — Figma's own check_box / check_box_outline_blank
 * glyphs, checked white, unchecked muted.
 */
export function MenuCheck({ checked }: { checked: boolean }) {
  return (
    <Icon
      name={checked ? "check_box" : "check_box_outline_blank"}
      className={checked ? "text-text-primary" : "text-text-muted"}
    />
  );
}

/**
 * Anchored popover (column menu, filters, sort): closes on Escape or an
 * outside press and returns focus to its trigger. Positioned by the caller
 * inside a `relative` wrapper, exactly where Figma draws it.
 */
export function Popover({
  open,
  onClose,
  triggerRef,
  label,
  className = "",
  children,
}: {
  open: boolean;
  onClose: () => void;
  triggerRef: RefObject<HTMLElement | null>;
  label: string;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const panel = ref.current;
    panel?.querySelector<HTMLElement>("select, input, button, [tabindex='0']")?.focus();
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panel?.contains(target) || triggerRef.current?.contains(target)) return;
      onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onClose();
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, triggerRef]);

  if (!open) return null;
  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={label}
      className={`absolute z-30 rounded-control bg-surface-base text-body text-text-primary ring-1 ring-line ${className}`}
    >
      {children}
    </div>
  );
}

/** Inline status line for loading/empty/error states inside admin pages. */
export function StatusMessage({ tone = "muted", children }: { tone?: "muted" | "error"; children: ReactNode }) {
  return (
    <p role={tone === "error" ? "alert" : "status"} className={`px-2 py-3 text-body ${tone === "error" ? "text-text-primary" : "text-text-muted"}`}>
      {children}
    </p>
  );
}
