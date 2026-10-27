"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { AdminIcon } from "./adminIcons";
import { focusRing } from "./controls";

/**
 * The desktop date picker (client review 2026-10-22: "according to the
 * design system"). The design system draws date fields — a 1px box reading
 * "April 6, 2026" (Master, Filter date) — but no desktop calendar, so the
 * calendar is built from its tokens: the admin's popover surface, 32px day
 * cells, the selected day white like a selected pill, today outlined.
 * Weeks start on Monday (the experiment is in Switzerland).
 *
 * Keyboard (WAI-ARIA date picker dialog): arrows move a day or a week,
 * PageUp/PageDown a month, Home/End the week's first/last day, Enter or
 * Space picks, Esc closes and returns to the field.
 */

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const monthTitle = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
const dayLabel = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

/** A calendar day as YYYY-MM-DD; all arithmetic in UTC so no time zone shifts a day. */
const pad = (n: number) => String(n).padStart(2, "0");
export const toDay = (date: Date) => `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
export const fromDay = (day: string) => new Date(`${day}T00:00:00Z`);
export const addDays = (day: string, days: number) => toDay(new Date(fromDay(day).getTime() + days * 86_400_000));
export function addMonths(day: string, months: number) {
  const date = fromDay(day);
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return toDay(new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(date.getUTCDate(), last))));
}
/** 0 = Monday … 6 = Sunday. */
const weekday = (day: string) => (fromDay(day).getUTCDay() + 6) % 7;

/** The 6 weeks shown for a month: Monday of the first week, 42 days. */
export function monthGrid(month: string): string[] {
  const first = `${month.slice(0, 7)}-01`;
  const start = addDays(first, -weekday(first));
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

/** Today in the viewer's own calendar. */
function localToday() {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function DatePicker({
  label,
  day,
  time,
  onPick,
  onClose,
}: {
  label: string;
  /** The chosen day (YYYY-MM-DD) or "". */
  day: string;
  /** With a time (HH:MM, the follow-up): the time row is shown. */
  time?: string;
  onPick: (value: { day: string; time?: string } | null) => void;
  onClose: (returnFocus: boolean) => void;
}) {
  const today = localToday();
  const [focused, setFocused] = useState(day || today);
  const [timeValue, setTimeValue] = useState(time ?? "09:00");
  const grid = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const month = focused.slice(0, 7);
  const days = monthGrid(focused);

  // Focus follows the roving day (the dialog opens on the chosen day, or today).
  useEffect(() => {
    grid.current?.querySelector<HTMLButtonElement>(`[data-day="${focused}"]`)?.focus();
  }, [focused]);

  // A press outside closes it (the value already picked stays).
  useEffect(() => {
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node) && !(event.target as Element).closest?.("[data-date-trigger]")) onClose(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [onClose]);

  const pick = (value: string) => {
    onPick({ day: value, ...(time !== undefined ? { time: timeValue } : {}) });
    if (time === undefined) onClose(true);
  };

  function onGridKey(event: KeyboardEvent<HTMLDivElement>) {
    const moves: Record<string, () => string> = {
      ArrowLeft: () => addDays(focused, -1),
      ArrowRight: () => addDays(focused, 1),
      ArrowUp: () => addDays(focused, -7),
      ArrowDown: () => addDays(focused, 7),
      PageUp: () => addMonths(focused, event.shiftKey ? -12 : -1),
      PageDown: () => addMonths(focused, event.shiftKey ? 12 : 1),
      Home: () => addDays(focused, -weekday(focused)),
      End: () => addDays(focused, 6 - weekday(focused)),
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      setFocused(move());
    }
  }

  const navButton = `flex size-8 cursor-pointer items-center justify-center rounded-control text-text-primary hover:ring-1 hover:ring-line ${focusRing}`;
  return (
    <div
      ref={root}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      data-date-picker
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose(true);
        }
      }}
      className="absolute top-full left-0 z-30 mt-1 w-[272px] rounded-control bg-surface-base p-2 text-body text-text-primary shadow-lg ring-1 ring-line"
    >
      <div className="flex items-center justify-between">
        <button type="button" className={navButton} aria-label="Previous month" onClick={() => setFocused(addMonths(focused, -1))}>
          <AdminIcon name="arrow_back" />
        </button>
        <h2 id={titleId} aria-live="polite" className="font-bold">
          <span className="sr-only">{label}: </span>
          {monthTitle.format(fromDay(`${month}-01`))}
        </h2>
        <button type="button" className={navButton} aria-label="Next month" onClick={() => setFocused(addMonths(focused, 1))}>
          <AdminIcon name="arrow_back" className="rotate-180" />
        </button>
      </div>
      <div ref={grid} role="grid" aria-labelledby={titleId} onKeyDown={onGridKey} className="mt-1">
        <div role="row" className="grid grid-cols-7">
          {WEEKDAYS.map((name, index) => (
            <span key={name} role="columnheader" aria-label={WEEKDAY_NAMES[index]} className="flex h-8 items-center justify-center text-meta text-text-muted">
              {name}
            </span>
          ))}
        </div>
        {[0, 1, 2, 3, 4, 5].map((week) => (
          <div key={week} role="row" className="grid grid-cols-7">
            {days.slice(week * 7, week * 7 + 7).map((value) => {
              const selected = value === day;
              const outside = value.slice(0, 7) !== month;
              return (
                <span key={value} role="gridcell" aria-selected={selected}>
                  <button
                    type="button"
                    data-day={value}
                    tabIndex={value === focused ? 0 : -1}
                    aria-label={`${dayLabel.format(fromDay(value))}${value === today ? ", today" : ""}`}
                    aria-current={value === today ? "date" : undefined}
                    onClick={() => pick(value)}
                    className={`flex size-8 cursor-pointer items-center justify-center rounded-control tabular-nums ${
                      selected ? "bg-text-primary font-bold text-surface-base" : outside ? "text-text-muted hover:ring-1 hover:ring-line" : "hover:ring-1 hover:ring-line"
                    } ${value === today && !selected ? "ring-1 ring-text-muted" : ""} ${focusRing}`}
                  >
                    {Number(value.slice(8))}
                  </button>
                </span>
              );
            })}
          </div>
        ))}
      </div>
      {time !== undefined ? (
        <label className="mt-2 flex h-8 items-center justify-between gap-2 border-t border-line pt-2 text-text-muted">
          Time
          <input
            type="time"
            value={timeValue}
            onChange={(event) => {
              setTimeValue(event.target.value);
              if (day && event.target.value) onPick({ day, time: event.target.value });
            }}
            className={`h-8 rounded-control bg-transparent px-2 text-text-primary ring-1 ring-line [color-scheme:dark] ${focusRing}`}
          />
        </label>
      ) : null}
      <div className="mt-2 flex justify-between border-t border-line pt-2">
        <button type="button" onClick={() => pick(today)} className={`h-8 cursor-pointer rounded-control px-2 font-bold hover:ring-1 hover:ring-line ${focusRing}`}>
          Today
        </button>
        <span className="flex gap-1">
          {day ? (
            <button
              type="button"
              onClick={() => {
                onPick(null);
                onClose(true);
              }}
              className={`h-8 cursor-pointer rounded-control px-2 hover:ring-1 hover:ring-line ${focusRing}`}
            >
              Clear
            </button>
          ) : null}
          {time !== undefined ? (
            <button type="button" onClick={() => onClose(true)} className={`h-8 cursor-pointer rounded-control px-2 font-bold ring-1 ring-line ${focusRing}`}>
              Done
            </button>
          ) : null}
        </span>
      </div>
    </div>
  );
}
