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
export function formatPublishedAt(date: Date): string {
  const hasTime = date.getUTCHours() !== 0 || date.getUTCMinutes() !== 0;
  const day = dateFormatter.format(date);
  return hasTime ? `${day} ${timeFormatter.format(date)}` : day;
}
