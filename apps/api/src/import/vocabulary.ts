import { comparable } from "./csv/csv-values.js";

/** A lookup row (state, source, contact channel…) as an import matches it. */
export interface Vocabulary {
  key: string;
  label: string;
}

/** Matches an option name to a lookup row by label or key — case, accents and extra spaces ignored; undefined when unknown. */
export function vocabularyMatcher(entries: Vocabulary[]) {
  const map = new Map<string, string>();
  for (const { key, label } of entries) {
    map.set(comparable(key), key);
    map.set(comparable(label), key);
  }
  return (name: string) => map.get(comparable(name)) ?? map.get(comparable(name).replace(/[^a-z0-9]+/g, "_"));
}
