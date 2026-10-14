"use client";

import Link from "next/link";
import { useId, useLayoutEffect, useRef, type ComponentProps, type ReactNode } from "react";
import { AdminIcon, type AdminIconName } from "./adminIcons";
import { focusRing } from "./controls";

/**
 * Record pages as drawn on admin-desktop.pdf p12 (measured on the frame):
 *
 * - a 40px header: back arrow 8px in, the bold title 8px after it;
 * - the properties column: rows 32px tall and 16px apart, a 168px label
 *   cell (type glyph 4px in, muted label at 24px) and the value from there;
 *   values read as plain text — borderless until hovered or focused;
 * - a right panel (400px at 1440, narrowing to 280px at 1024) behind a 1px
 *   rule: 34px meta rows (label at 24px, value at 176px), then full-width
 *   32px buttons 8px apart. Room is left under them for the History panel.
 */

/** Borderless value input: text at 8px, a ring only on hover / focus. */
export const recordInput = `h-8 w-full rounded-control bg-transparent px-2 text-body text-text-primary outline-none placeholder:text-text-muted hover:ring-1 hover:ring-line focus-visible:ring-1 focus-visible:ring-text-primary`;

/**
 * Multi-line value in the same borderless style, growing with its text
 * (no resize handle): one row when empty, as tall as the content after.
 */
export function AutoGrowTextarea({ value, className = "", ...rest }: Omit<ComponentProps<"textarea">, "rows"> & { value: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
  }, [value]);
  return <textarea ref={ref} rows={1} value={value} className={`${recordInput} block min-h-8 resize-none overflow-hidden py-[7px] ${className}`} {...rest} />;
}

const calendarDay = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
/** A calendar date (YYYY-MM-DD) as Figma shows dates in tables: "Oct 14, 2026" (the same day in every time zone). */
export const formatCalendarDay = (day: string) => calendarDay.format(new Date(`${day}T00:00:00Z`));

/**
 * A calendar date in the record's borderless style: the value reads
 * "Oct 14, 2026" (or a muted "Empty"), never the browser's light-grey
 * mm/dd/yyyy mask. Pressing it opens the native picker in its dark
 * scheme; a clear button removes the date.
 */
export function DateField({
  id,
  value,
  onChange,
  label,
}: {
  id: string;
  /** YYYY-MM-DD, or "" for none. */
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  const picker = useRef<HTMLInputElement>(null);
  const open = () => {
    const input = picker.current;
    if (!input) return;
    try {
      input.showPicker();
    } catch {
      input.focus(); // very old browsers: the native field takes the focus instead
    }
  };
  return (
    <span className="relative flex w-full max-w-[240px] items-center">
      {/* The real date input: invisible, under the button, so the picker opens right there. */}
      <input
        ref={picker}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="pointer-events-none absolute inset-0 opacity-0 [color-scheme:dark]"
      />
      <button
        id={id}
        type="button"
        onClick={open}
        aria-label={`${label}: ${value ? formatCalendarDay(value) : "empty"}. Choose a date`}
        className={`${recordInput} relative cursor-pointer text-left ${value ? "" : "text-text-muted"}`}
      >
        {value ? formatCalendarDay(value) : "Empty"}
      </button>
      {value ? (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label={`Clear ${label}`}
          className={`relative ml-1 shrink-0 cursor-pointer rounded-control text-text-muted hover:text-text-primary ${focusRing}`}
        >
          <AdminIcon name="close" />
        </button>
      ) : null}
    </span>
  );
}

export function RecordLayout({
  backHref,
  backLabel,
  title,
  panel,
  children,
}: {
  backHref: string;
  backLabel: string;
  title: string;
  panel?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-10 shrink-0 items-center gap-2 px-2">
        <Link href={backHref} aria-label={`Back to ${backLabel}`} title={`Back to ${backLabel}`} className={`flex rounded-control ${focusRing}`}>
          <AdminIcon name="arrow_back" />
        </Link>
        <h1 className="min-w-0 truncate text-body font-bold">{title || "Untitled"}</h1>
      </header>
      <div className="flex min-h-0 flex-1">
        <div data-record-main className="min-w-0 flex-1 overflow-y-auto px-2 pt-2 pb-6">
          <div className="flex flex-col gap-4">{children}</div>
        </div>
        {panel ? (
          <aside data-record-panel aria-label="Record details" className="w-[clamp(280px,calc((100vw-240px)/3),400px)] shrink-0 overflow-y-auto px-2 pt-1 pb-6 shadow-[-1px_0_0_0_var(--color-line)]">
            {panel}
          </aside>
        ) : null}
      </div>
    </div>
  );
}

export function PropertyRow({
  icon,
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  icon: AdminIconName;
  label: string;
  htmlFor?: string;
  /** Figma's grey note under the label, e.g. "People can have up to 10 expertise." */
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  const id = useId();
  const Label = htmlFor ? "label" : "span";
  return (
    <div className="grid grid-cols-[168px_minmax(0,1fr)] items-start">
      <div>
        <Label id={`${id}-label`} {...(htmlFor ? { htmlFor } : {})} className="flex h-8 items-center gap-1 pl-1 text-body text-text-muted">
          <AdminIcon name={icon} />
          {label}
        </Label>
        {hint ? (
          <p data-hint className="mt-0.5 w-40 rounded-control bg-surface-raised p-2 text-meta leading-4 text-text-primary">
            {hint}
          </p>
        ) : null}
      </div>
      <div className="flex min-h-8 min-w-0 flex-col justify-center text-body">
        {children}
        {error ? (
          <p role="alert" className="mt-1 px-2 text-meta text-text-primary">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export interface PillOption {
  value: string;
  label: string;
}

/**
 * Figma's single-select pills (State, Source, Do not contact): 32px round
 * pills, 12px text, 1px muted ring — white on the selected one. Toggle
 * buttons in a labelled group; with `allowEmpty`, pressing the selected
 * pill clears the value.
 */
export function Pills({
  label,
  options,
  value,
  onChange,
  allowEmpty = false,
}: {
  label: string;
  options: readonly PillOption[];
  value: string;
  onChange: (value: string) => void;
  allowEmpty?: boolean;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => (selected ? allowEmpty && onChange("") : onChange(option.value))}
            className={`flex h-8 cursor-pointer items-center rounded-full px-2 text-meta whitespace-nowrap text-text-primary ring-1 ${selected ? "ring-text-primary" : "ring-line hover:ring-text-muted"} ${focusRing}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** Right-panel meta row: glyph + muted label, value from 176px (Figma, 1440); narrower panels size the label to its text. */
export function PanelRow({ icon, label, children }: { icon: AdminIconName; label: string; children: ReactNode }) {
  return (
    <div className="grid min-h-[34px] grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 text-body min-[1400px]:grid-cols-[176px_minmax(0,1fr)] min-[1400px]:gap-x-0">
      <span className="flex items-center gap-1 pl-1 text-text-muted">
        <AdminIcon name={icon} />
        {label}
      </span>
      <span className="text-text-primary">{children}</span>
    </div>
  );
}

/** Full-width 32px panel button (admin-desktop.pdf p12: glyph 8px in, bold label 8px after it). */
export function PanelButton({
  icon,
  children,
  type = "button",
  ...rest
}: { icon: AdminIconName; children: ReactNode } & Omit<React.ComponentProps<"button">, "children">) {
  return (
    <button
      type={type}
      className={`flex h-8 w-full cursor-pointer items-center gap-2 rounded-control px-2 text-body font-bold text-text-primary ring-1 ring-line disabled:cursor-not-allowed disabled:text-text-muted ${focusRing}`}
      {...rest}
    >
      <AdminIcon name={icon} />
      {children}
    </button>
  );
}

const day = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" });
const time = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });
/** Figma's panel date: "September 25, 2026 3:26 PM". */
export const formatPanelDate = (iso: string) => `${day.format(new Date(iso))} ${time.format(new Date(iso))}`;
