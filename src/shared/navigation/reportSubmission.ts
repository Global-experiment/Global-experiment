import { typeKeys } from "@/shared/report/reportKinds";
import { sanitizeSourcePage, type ReportKind } from "./sourcePage";

/** The longest text the API keeps (apps/api/src/feedback/feedback.contracts.ts). */
export const REPORT_MESSAGE_LIMIT = 5000;

const LOCALE = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{1,8})*$/;

/**
 * What a Send feedback / Report issue submission carries to the API
 * (POST /api/feedback/submissions), apart from the bot check's token: the
 * trimmed text, the chosen types as the API's keys, the validated origin
 * page and the browser's language.
 */
export interface ReportSubmissionDraft {
  kind: ReportKind;
  message: string;
  /** API keys (feature_request…), in the kind's own order. */
  types: string[];
  /** Validated internal path the report was opened from, or null. */
  sourcePage: string | null;
  /** The browser's language (en-GB), or null when it isn't a language tag. */
  locale: string | null;
}

export function buildReportSubmission(input: {
  kind: ReportKind;
  message: string;
  /** The type labels the visitor chose. */
  types: Iterable<string>;
  sourcePage: string | null | undefined;
  locale?: string | null;
}): ReportSubmissionDraft {
  const locale = input.locale?.trim() ?? "";
  return {
    kind: input.kind,
    message: input.message.trim(),
    types: typeKeys(input.kind, input.types),
    sourcePage: sanitizeSourcePage(input.sourcePage),
    locale: locale.length <= 35 && LOCALE.test(locale) ? locale : null,
  };
}
