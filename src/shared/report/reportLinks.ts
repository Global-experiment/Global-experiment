import { sanitizeSourcePage, sourcePageFromSearch, type ReportKind } from "@/shared/navigation/sourcePage";
import { knownTypes } from "./reportKinds";

/**
 * The composer URL once the visitor has qualified their report on the page
 * they came from (Review #3 item 5):
 *
 *   /issue?source=%2Fdocumentation%23introduction&qualified=1&type=Visual%20bug
 *
 * `qualified=1` (even with zero types — selecting none is allowed) tells the
 * composer not to ask again. `source` goes through the same same-site
 * sanitizer as before, so an external URL can never be carried.
 */
export function composerHref(kind: ReportKind, source: string | null | undefined, types: readonly string[]): string {
  const params = new URLSearchParams();
  const safe = sanitizeSourcePage(source);
  if (safe) params.set("source", safe);
  params.set("qualified", "1");
  for (const label of knownTypes(kind, types)) params.append("type", label);
  return `/${kind}?${params.toString()}`;
}

export interface ComposerContext {
  sourcePage: string | null;
  /** Qualified on the origin page: the composer opens straight to the paragraph. */
  qualified: boolean;
  types: string[];
}

/** Reads the composer URL back; unknown type labels are dropped. */
export function composerContextFromSearch(kind: ReportKind, search: string): ComposerContext {
  const params = new URLSearchParams(search);
  return {
    sourcePage: sourcePageFromSearch(search),
    qualified: params.get("qualified") === "1",
    types: knownTypes(kind, params.getAll("type")),
  };
}
