/**
 * The name of a duplicated record (client, 2026-10-22): the original name
 * and " DUPLICATE", so the copy can't be mistaken for the original. Names
 * are at most 200 characters: a long name is shortened to make room.
 */
export const DUPLICATE_SUFFIX = " DUPLICATE";
export const NAME_MAX = 200;

export function duplicateName(name: string): string {
  const base = name.trim();
  return `${base.slice(0, NAME_MAX - DUPLICATE_SUFFIX.length).trimEnd()}${DUPLICATE_SUFFIX}`;
}
