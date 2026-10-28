"use client";

import { useSyncExternalStore } from "react";
import { DEFAULT_TIME_ZONE, formatElapsed, formatFullDateTime, formatReference, formatShortDateTime, type TimestampInput } from "./dates";

/**
 * The viewer's time zone: Europe/Zurich on the server and until hydration,
 * then the one chosen in Profile settings (admin-desktop.pdf p18), else the
 * browser's.
 */
let preferredTimeZone: string | null = null;
const zoneListeners = new Set<() => void>();
const subscribeZone = (listener: () => void) => {
  zoneListeners.add(listener);
  return () => zoneListeners.delete(listener);
};
const viewerTimeZone = () => preferredTimeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIME_ZONE;
export const useViewerTimeZone = () => useSyncExternalStore(subscribeZone, viewerTimeZone, () => DEFAULT_TIME_ZONE);

/** The admin's own time zone (null = the browser's); every Timestamp follows at once. */
export function setPreferredTimeZone(zone: string | null) {
  if (zone === preferredTimeZone) return;
  preferredTimeZone = zone;
  for (const listener of zoneListeners) listener();
}

/** A clock that ticks every 30 seconds while something on the page shows elapsed time. */
const listeners = new Set<() => void>();
let ticker: ReturnType<typeof setInterval> | undefined;
let nowMinute = Date.now();
function subscribeClock(listener: () => void) {
  listeners.add(listener);
  ticker ??= setInterval(() => {
    nowMinute = Date.now();
    for (const each of listeners) each();
  }, 30_000);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && ticker) {
      clearInterval(ticker);
      ticker = undefined;
    }
  };
}
const useNow = (serverNow: number) => useSyncExternalStore(subscribeClock, () => nowMinute, () => serverNow);

/**
 * A timestamp in the client's format for its context (formatting.md):
 * `elapsed` for clickable content ("3d", updating while the page is open),
 * `short` among other timestamps ("Oct 14 9:24 PM"), `full` for a record's own
 * dates ("October 14 at 9:24 PM"). Always a <time> with the exact reference
 * (year and time zone) on hover and keyboard focus.
 */
export function Timestamp({ value, format, serverNow = 0, className = "" }: { value: TimestampInput; format: "elapsed" | "short" | "full"; serverNow?: number; className?: string }) {
  const timeZone = useViewerTimeZone();
  const now = useNow(serverNow || new Date(value).getTime());
  const date = new Date(value);
  const reference = formatReference(date, timeZone);
  const elapsed = format === "elapsed" ? formatElapsed(date, now) : null;
  const text = elapsed ? elapsed.text : format === "short" ? formatShortDateTime(date, timeZone) : formatFullDateTime(date, timeZone);
  return (
    <time
      dateTime={date.toISOString()}
      title={reference}
      tabIndex={0}
      aria-label={elapsed ? `${elapsed.spoken}, ${reference}` : reference}
      className={`rounded-control focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary ${className}`}
      suppressHydrationWarning
    >
      {text}
    </time>
  );
}
