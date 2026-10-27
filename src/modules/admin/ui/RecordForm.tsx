"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { formatDateOnly, formatFullDateTime, formatReference } from "@/shared/format/dates";
import { useViewerTimeZone } from "@/shared/format/Timestamp";
import { Icon } from "@/shared/ui/icons";
import { AdminIcon, type AdminIconName } from "./adminIcons";
import { focusRing } from "./controls";
import { DatePicker } from "./DatePicker";

/**
 * Record pages as drawn on admin-desktop.pdf p12 (measured on the frame):
 *
 * - a 40px header: back arrow 8px in, the bold title 8px after it;
 * - the properties column: rows 32px tall and 16px apart, a 168px label
 *   cell (type glyph 4px in, muted label at 24px) and the value from there;
 *   values are the design-system fields of the updated Figma (p14 and the
 *   person-record prototype, 2026-10-21): the value as plain text, with its
 *   placeholder ("Enter a number", "Search", "Set a date") when empty. They
 *   still read as editable (client, 2026-10-14): a 1px rule on hover, white
 *   when focused. Every field fills the value column (client, 2026-10-22);
 *   limits ("up to 10 expertise") and tips in an info card under the label;
 *   an invalid field shows the design system's error state: a white 1px rule
 *   and, under it, the warning glyph and the message (checked on leaving it);
 * - a right panel (400px at 1440, narrowing to 280px at 1024) behind a 1px
 *   rule: 34px meta rows (label at 24px, value at 176px), then full-width
 *   32px buttons 8px apart. Room is left under them for the History panel.
 */

/** The field look shared by every record value (no text colour or width: callers add them). */
export const recordField =
  "h-8 w-full rounded-control bg-transparent px-2 text-body font-normal outline-none ring-1 ring-transparent placeholder:text-text-muted hover:ring-line focus-visible:ring-text-primary aria-[invalid=true]:ring-text-primary";

/** A single-line value: a visible field, text at 8px, the full width of the value column. */
export const recordInput = `${recordField} text-text-primary`;

/** The id of a field's error message (PropertyRow renders it; the field points at it with aria-describedby). */
export const errorIdFor = (fieldId: string) => `${fieldId}-error`;

/** aria-invalid / aria-describedby for a field and its error, if any. */
export const invalidProps = (fieldId: string, error: string | undefined) =>
  error ? ({ "aria-invalid": true, "aria-describedby": errorIdFor(fieldId) } as const) : ({} as const);

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
  return <textarea ref={ref} rows={1} value={value} className={`${recordField} block min-h-8 resize-none overflow-hidden py-[7px] text-text-primary ${className}`} {...rest} />;
}

const calendarDay = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
/** A calendar date (YYYY-MM-DD) as Figma shows dates in tables: "Oct 14, 2026" (the same day in every time zone). */
export const formatCalendarDay = (day: string) => calendarDay.format(new Date(`${day}T00:00:00Z`));

/** The field that opens the date picker: the value (or "Set a date") with the calendar glyph, and a clear button. */
function DateTrigger({
  id,
  label,
  shown,
  title,
  open,
  setOpen,
  onClear,
  error,
  children,
}: {
  id: string;
  label: string;
  shown: string | null;
  title?: string;
  open: boolean;
  setOpen: (open: boolean) => void;
  onClear: () => void;
  error?: string;
  children: ReactNode;
}) {
  return (
    <span className="relative flex w-full items-center">
      <button
        id={id}
        type="button"
        data-date-trigger
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        title={title}
        aria-label={`${label}: ${shown ?? "not set"}. Choose a date`}
        {...invalidProps(id, error)}
        className={`${recordField} relative flex cursor-pointer items-center gap-2 text-left ${shown ? "text-text-primary" : "text-text-muted"}`}
      >
        <AdminIcon name="calendar" />
        <span data-date-value className="flex-1 truncate">
          {shown ?? "Set a date"}
        </span>
      </button>
      {shown ? (
        <button
          type="button"
          onClick={onClear}
          aria-label={`Clear ${label}`}
          className={`relative ml-1 shrink-0 cursor-pointer rounded-control text-text-muted hover:text-text-primary ${focusRing}`}
        >
          <AdminIcon name="close" />
        </button>
      ) : null}
      {open ? children : null}
    </span>
  );
}

/**
 * A calendar date (first and last contact): "October 14, 2026" or a muted
 * "Set a date"; the design-system picker (DatePicker) opens under it. Shown
 * as stored, never converted between time zones.
 */
export function DateField({ id, value, onChange, label, error }: { id: string; value: string; onChange: (value: string) => void; label: string; error?: string }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(
    (returnFocus: boolean) => {
      setOpen(false);
      if (returnFocus) document.getElementById(id)?.focus();
    },
    [id],
  );
  return (
    <DateTrigger id={id} label={label} shown={value ? formatDateOnly(value) : null} open={open} setOpen={setOpen} onClear={() => onChange("")} error={error}>
      <DatePicker label={label} day={value} onPick={(picked) => onChange(picked?.day ?? "")} onClose={close} />
    </DateTrigger>
  );
}

/**
 * A date AND time (the follow-up): "October 14 at 9:24 PM" in the viewer's
 * time zone (the year on hover), or "Set a date". `value` is a local
 * "YYYY-MM-DDTHH:MM" (the viewer's zone) or "".
 */
export function DateTimeField({ id, value, onChange, label, error }: { id: string; value: string; onChange: (value: string) => void; label: string; error?: string }) {
  const [open, setOpen] = useState(false);
  const timeZone = useViewerTimeZone();
  const instant = value ? new Date(value) : null;
  const shown = instant && !Number.isNaN(instant.getTime()) ? formatFullDateTime(instant, timeZone) : null;
  const close = useCallback(
    (returnFocus: boolean) => {
      setOpen(false);
      if (returnFocus) document.getElementById(id)?.focus();
    },
    [id],
  );
  return (
    <DateTrigger
      id={id}
      label={label}
      shown={shown}
      title={instant ? formatReference(instant, timeZone) : undefined}
      open={open}
      setOpen={setOpen}
      onClear={() => onChange("")}
      error={error}
    >
      <DatePicker
        label={label}
        day={value.slice(0, 10)}
        time={value.slice(11, 16) || "09:00"}
        onPick={(picked) => onChange(picked ? `${picked.day}T${picked.time ?? "09:00"}` : "")}
        onClose={close}
      />
    </DateTrigger>
  );
}

/** A checkbox value (prototype: "☑ Do not contact"): the box, then its label, 24px apart from the row's edge. */
export function CheckboxField({ id, checked, onChange, children }: { id: string; checked: boolean; onChange: (checked: boolean) => void; children: ReactNode }) {
  return (
    <label htmlFor={id} className="flex h-8 w-fit cursor-pointer items-center gap-2 rounded-control px-2 text-body text-text-primary ring-1 ring-transparent hover:ring-line has-[:focus-visible]:ring-text-primary">
      <input id={id} type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="peer sr-only" />
      <Icon name={checked ? "check_box" : "check_box_outline_blank"} />
      {children}
    </label>
  );
}

/** A read-only value (Person ID, Updated, Created…). */
export function ReadOnlyValue({ children }: { children: ReactNode }) {
  return <span className="flex h-8 items-center px-2 text-body text-text-primary">{children}</span>;
}

/** An admin as the record shows them (Last edited by, Created by): the avatar disc and the bold name. */
export function PersonChip({ name }: { name: string }) {
  return (
    <span className="flex h-8 items-center gap-2 px-2 text-meta font-bold text-text-primary">
      <span aria-hidden="true" className="size-4 rounded-full bg-avatar" />
      {name}
    </span>
  );
}

/** Same pattern as the admin layout's metadata template, for titles known only in the browser. */
export function useAdminTitle(title: string) {
  useEffect(() => {
    // Empty while loading: the page's own title ("Person") stays until the record arrives.
    // The tab shows the page title only (client, 2026-10-23).
    if (title.trim()) document.title = title.trim();
  }, [title]);
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
  // The browser tab shows the record's header title (client, 2026-10-19), e.g. "Stanley Qiang".
  useAdminTitle(title);
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
  /** Muted help text under the field, e.g. "People can have up to 10 expertise." */
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  const id = useId();
  const Label = htmlFor ? "label" : "span";
  return (
    <div className="grid grid-cols-[168px_minmax(0,1fr)] items-start">
      <div className="pr-2">
        <Label id={`${id}-label`} {...(htmlFor ? { htmlFor } : {})} className="flex min-h-8 items-center gap-1 pl-1 text-body text-text-muted">
          <AdminIcon name={icon} />
          {label}
        </Label>
        {hint ? (
          // Prototype: the limit in a small box under the label ("People can have up to 5 organizations.").
          <p data-hint className="mt-2 rounded-control bg-surface-raised px-2 py-1 text-meta text-text-primary">
            {hint}
          </p>
        ) : null}
      </div>
      <div className="flex min-h-8 min-w-0 flex-col justify-center text-body">
        {children}
        {error ? (
          // The design system's error state (Profile and account, "Invalid email address"): the warning glyph, then the message.
          <p role="alert" id={htmlFor ? errorIdFor(htmlFor) : undefined} data-field-error className="mt-1 flex items-center gap-1 text-meta text-text-primary">
            <AdminIcon name="warning" />
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
