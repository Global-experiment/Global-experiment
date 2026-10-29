/**
 * Cell values as spreadsheets and Notion write them, turned into what the
 * detail page sends: dates as YYYY-MM-DD, yes/no as booleans, lists of
 * names split, Notion's "(https://www.notion.so/…)" link suffix removed.
 */

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

const pad = (value: number) => String(value).padStart(2, "0");

function isoDate(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}-${pad(month)}-${pad(day)}`;
}

function monthOf(name: string): number | null {
  const lower = name.toLowerCase();
  const index = MONTHS.findIndex((month) => month === lower || (lower.length >= 3 && month.startsWith(lower)));
  return index === -1 ? null : index + 1;
}

/**
 * A calendar date, or null when unreadable. Accepted: 2026-10-30,
 * 2026/10/30, 30.10.2026, "October 30, 2026" (Notion), "30 October 2026".
 * Slashes with the day first or the month first (10/30/2026) are refused
 * as ambiguous.
 */
export function parseDate(raw: string): string | null {
  const value = raw.trim();
  let match = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(value);
  if (match) return isoDate(Number(match[1]), Number(match[2]), Number(match[3]));
  match = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(value);
  if (match) return isoDate(Number(match[3]), Number(match[2]), Number(match[1]));
  match = /^([A-Za-z]+)\.? (\d{1,2}),? (\d{4})$/.exec(value);
  if (match) {
    const month = monthOf(match[1]!);
    return month ? isoDate(Number(match[3]), month, Number(match[2])) : null;
  }
  match = /^(\d{1,2}) ([A-Za-z]+)\.?,? (\d{4})$/.exec(value);
  if (match) {
    const month = monthOf(match[2]!);
    return month ? isoDate(Number(match[3]), month, Number(match[1])) : null;
  }
  return null;
}

/** A date-time with its offset (ISO 8601), as written; null when not one. */
export function parseInstant(raw: string): string | null {
  const value = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const instant = new Date(value);
  return Number.isNaN(instant.getTime()) ? null : instant.toISOString();
}

const TRUE = new Set(["yes", "y", "true", "1", "x", "✓", "✔", "checked", "oui", "ja"]);
const FALSE = new Set(["no", "n", "false", "0", "unchecked", "non", "nein"]);

/** Yes / no; null when it's neither. */
export function parseBoolean(raw: string): boolean | null {
  const value = raw.trim().toLowerCase();
  if (TRUE.has(value)) return true;
  if (FALSE.has(value)) return false;
  return null;
}

/** Notion's CSV export writes a relation as "Name (https://www.notion.so/…)". */
const withoutNotionLink = (value: string) => value.replace(/\s*\(https?:\/\/(www\.)?notion\.(so|site)\/[^)]*\)\s*$/i, "").trim();

/**
 * The names in a cell, matched with `known` (whose keys are lowercased
 * names): the whole cell first (a name may contain a comma), then split on
 * new lines and semicolons, then on commas too.
 */
export function splitNames(raw: string, known: (name: string) => boolean): string[] {
  const value = raw.trim();
  if (!value) return [];
  const clean = (parts: string[]) => parts.map(withoutNotionLink).filter((part) => part !== "");
  const whole = clean([value]);
  if (whole.length === 1 && known(whole[0]!)) return whole;
  const coarse = clean(value.split(/\r?\n|;/));
  if (coarse.every(known)) return coarse;
  return clean(value.split(/\r?\n|;|,(?![^(]*\))/));
}

/** A name or label for comparing: case, accents and extra spaces ignored. */
export const comparable = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/** A website for comparing: no scheme, no "www.", no trailing slash, lowercase. */
export const comparableUrl = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/+$/, "");

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** PER-12, ORG-3, GE-000001: display numbers, never used to match anything. */
export const DISPLAY_NUMBER = /^(PER|ORG|GE)-\d+$/i;
