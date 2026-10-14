/**
 * The demo-record markers (project rule "No demo data, anywhere" —
 * docs/architecture/data-model.md §5), for values read from Notion. The
 * purge command applies the same markers in SQL (scripts/demo-data-purge.ts).
 *
 * - an email or website on `example.org` or a subdomain (a reserved domain,
 *   RFC 2606: no real person or organization uses it);
 * - the text "Fictional sample";
 * - a value starting with `DEMO-` (e.g. a demo Wise recipient ID).
 */
const EXAMPLE_DOMAIN = /(@|:\/\/)([a-z0-9-]+\.)*example\.org([/:?#]|$)/i;

export function demoMarkers(values: { emails?: (string | null)[]; urls?: (string | null)[]; texts?: (string | null)[] }): string[] {
  const markers = new Set<string>();
  for (const email of values.emails ?? []) if (email && EXAMPLE_DOMAIN.test(email.trim())) markers.add("example.org email");
  for (const url of values.urls ?? []) if (url && EXAMPLE_DOMAIN.test(url.trim())) markers.add("example.org website");
  const all = [...(values.texts ?? []), ...(values.emails ?? []), ...(values.urls ?? [])];
  for (const text of all) {
    if (!text) continue;
    if (/fictional sample/i.test(text)) markers.add('"Fictional sample" text');
    if (/^DEMO-/.test(text.trim())) markers.add("DEMO- value");
  }
  return [...markers];
}
