/**
 * A duplicated record's name (client, 2026-10-22): the original and
 * " DUPLICATE", shortened to stay within 200 characters. The API's
 * Duplicate does the same (apps/api/src/common/duplicate-name.ts).
 */
const SUFFIX = " DUPLICATE";

export const duplicateName = (name: string) => `${name.trim().slice(0, 200 - SUFFIX.length).trimEnd()}${SUFFIX}`;
