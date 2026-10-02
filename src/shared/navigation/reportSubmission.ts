import { sanitizeSourcePage, type ReportKind } from "./sourcePage";

/**
 * What a Send feedback / Report issue submission will carry once the M2
 * pipeline exists. Nothing posts it yet — there's no endpoint — but the
 * composer already builds it so `sourcePage` is part of the model from day one.
 */
export interface ReportSubmissionDraft {
  kind: ReportKind;
  message: string;
  types: string[];
  /** Validated internal path the report was opened from, or null. */
  sourcePage: string | null;
}

export function buildReportSubmission(input: {
  kind: ReportKind;
  message: string;
  types: Iterable<string>;
  sourcePage: string | null | undefined;
}): ReportSubmissionDraft {
  return {
    kind: input.kind,
    message: input.message.trim(),
    types: [...input.types],
    sourcePage: sanitizeSourcePage(input.sourcePage),
  };
}
