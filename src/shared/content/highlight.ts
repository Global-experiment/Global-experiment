export interface HighlightSegment {
  text: string;
  match: boolean;
}

/**
 * Splits `text` into plain and matching segments for every case-insensitive
 * occurrence of `query` (trimmed; non-overlapping, left to right). Pure and
 * string-only — the caller renders segments as React nodes, never HTML.
 */
export function splitHighlights(text: string, query: string): HighlightSegment[] {
  const needle = query.trim().toLowerCase();
  if (!needle || !text) return text ? [{ text, match: false }] : [];

  const haystack = text.toLowerCase();
  const segments: HighlightSegment[] = [];
  let cursor = 0;
  for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, at + needle.length)) {
    if (at > cursor) segments.push({ text: text.slice(cursor, at), match: false });
    segments.push({ text: text.slice(at, at + needle.length), match: true });
    cursor = at + needle.length;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), match: false });
  return segments;
}
