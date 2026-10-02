const dateFormatter = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" });
const timeFormatter = new Intl.DateTimeFormat("en", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "UTC",
});

/**
 * "Aug 12 09:14" as in figma.pdf p15 (date and time separated by a space,
 * no comma). Notion's "Published at" may be a bare date (midnight UTC) —
 * then the time is omitted rather than showing 00:00. Always UTC so server
 * and client render the same string (no hydration mismatch, no
 * viewer-timezone drift in a published-date stamp).
 */
const clockFormatter = new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "UTC" });

/**
 * "at 2:07 PM" (figma.pdf p18's "This page was last updated at 2:07 PM.")
 * when `date` is today, else "on Aug 12 at 2:07 PM" — a bare clock time
 * would be misleading for an older edit. UTC, like formatPublishedAt.
 */
export function formatUpdatedAt(date: Date, now: Date = new Date()): string {
  const time = clockFormatter.format(date);
  return dateFormatter.format(date) === dateFormatter.format(now) && date.getUTCFullYear() === now.getUTCFullYear()
    ? `at ${time}`
    : `on ${dateFormatter.format(date)} at ${time}`;
}

export function formatPublishedAt(date: Date): string {
  const hasTime = date.getUTCHours() !== 0 || date.getUTCMinutes() !== 0;
  const day = dateFormatter.format(date);
  return hasTime ? `${day} ${timeFormatter.format(date)}` : day;
}
