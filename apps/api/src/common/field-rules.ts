/**
 * Field rules shared by the admin pages and the API (OPS-70): the page checks a field when it is left and
 * before sending; the API refuses the same values with a 400. ONE file, kept in two places because the API
 * and the website build separately: apps/api/src/common/field-rules.ts and src/shared/validation/fieldRules.ts.
 * A test (field-rules-same.test.ts) fails if the two copies differ by a single character: edit one, copy it
 * over the other.
 *
 * No imports: plain functions and messages, usable in a browser, in Node and in a zod refine. Messages are
 * plain, short English, without technical details, worded as the admin already showed them.
 */

export const FIELD_MESSAGES = {
  // The design system's error state ("Invalid email address", Profile and account p12); CSV import reports reuse these.
  email: "Invalid email address.",
  link: "Invalid link. Use an address like https://example.org.",
  score: "Use a whole number from 0 to 10.",
  wholeNumber: "Use a whole number.",
  slug: "Use lowercase letters, numbers and single hyphens (like version-0-1-scope).",
  date: "Enter a valid date.",
} as const;

/** "Name is required." / "Use at most 200 characters." */
export const requiredMessage = (label: string) => `${label} is required.`;
export const tooLongMessage = (max: number) => `Use at most ${max} characters.`;

/** The longest values the database keeps (the API enforces them; the page stops typing there). */
export const FIELD_LIMITS = {
  name: 200,
  email: 320,
  link: 2048,
  description: 5000,
  displayName: 80,
} as const;

const HOST = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

/**
 * An email address as people write them: a local part of letters, digits and the usual signs (no leading,
 * trailing or double dot, at most 64 characters), "@", and a domain with a top-level part of 2+ letters
 * (example.org, mail.example.co.uk). No spaces, no display name, no IP address. Whether the mailbox exists
 * isn't checked.
 */
export function isEmail(value: string): boolean {
  const text = value.trim();
  if (text.length > FIELD_LIMITS.email) return false;
  const at = text.lastIndexOf("@");
  if (at < 1) return false;
  const local = text.slice(0, at);
  const domain = text.slice(at + 1);
  if (local.length > 64 || !/^[a-z0-9!#$%&'*+/=?^_`{|}~.-]+$/i.test(local)) return false;
  if (local.startsWith(".") || local.endsWith(".") || local.includes("..")) return false;
  return HOST.test(domain);
}

/**
 * Link fields (website, X, LinkedIn, other socials, a service's address): an http(s) address, with or
 * without its scheme ("x.com/profile" as in the prototype), a host name with a dot and a top-level domain of
 * 2+ letters, no spaces, no user name or password. Whether the page exists isn't checked.
 */
export function isWebLink(value: string): boolean {
  const text = value.trim();
  if (!text || /\s/.test(text)) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(text) && !/^https?:\/\//i.test(text)) return false;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return false;
  }
  return HOST.test(url.hostname) && !url.username && !url.password;
}

/** A relevance score as typed: a whole number from 0 to 10. */
export const isScore = (value: string) => /^(?:[0-9]|10)$/.test(value.trim());

/** A whole number as typed, negative allowed ("-1", "12"). */
export const isWholeNumber = (value: string) => /^-?\d{1,9}$/.test(value.trim());

/** A page address segment: lowercase letters and numbers, single hyphens between them. */
export const isSlug = (value: string) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);

/** A calendar day "YYYY-MM-DD" that exists (no 2026-02-30). */
export function isCalendarDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const day = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(day.getTime()) && day.toISOString().slice(0, 10) === value;
}
