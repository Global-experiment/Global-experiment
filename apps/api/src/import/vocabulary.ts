/** A lookup row (state, source, contact channel…) as an import matches it. */
export interface Vocabulary {
  key: string;
  label: string;
}

/** Matches an option name to a lookup row by label or key (case-insensitive); undefined when unknown. */
export function vocabularyMatcher(entries: Vocabulary[]) {
  const map = new Map<string, string>();
  for (const { key, label } of entries) {
    map.set(key.toLowerCase(), key);
    map.set(label.trim().toLowerCase(), key);
  }
  return (name: string) => map.get(name.trim().toLowerCase()) ?? map.get(name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_"));
}
