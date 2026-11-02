const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Zurich's offset from UTC (minutes) at an instant: +120 in summer, +60 in winter. */
function zurichOffsetMinutes(at: Date): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Zurich", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
      .formatToParts(at)
      .map((part) => [part.type, part.value]),
  );
  const local = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
  return Math.round((local - at.getTime()) / 60_000);
}

/**
 * The follow-up as an instant: a date-time as written; a date alone is that
 * day at 09:00 in Zurich — the rule migration 0010 applied to existing dates.
 */
export function followUpInstant(value: string | null): string | null {
  if (value === null) return null;
  if (DATE.test(value)) {
    const nineUtc = new Date(`${value}T09:00:00Z`);
    return new Date(nineUtc.getTime() - zurichOffsetMinutes(nineUtc) * 60_000).toISOString();
  }
  const instant = new Date(value);
  return Number.isNaN(instant.getTime()) ? null : instant.toISOString();
}
