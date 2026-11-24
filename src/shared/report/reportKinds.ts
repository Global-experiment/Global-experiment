import type { ReportKind } from "@/shared/navigation/sourcePage";

export interface ReportType {
  /** What the API stores (migration 0020 seeds the same keys). */
  key: string;
  label: string;
  description: string;
}

export interface ReportKindConfig {
  /** Composer page title. */
  title: string;
  /** Qualification sheet title (figma.pdf p23/p27). */
  sheetTitle: string;
  /** CTA of both the qualification sheet and the composer. */
  ctaLabel: string;
  messageLabel: string;
  placeholder: string;
  /** Once the API has saved it (Figma p7: "Feedback sent"). */
  sentTitle: string;
  sentBody: string;
  types: readonly ReportType[];
}

/**
 * The two report flows, defined once for the launcher (qualification sheet
 * over the page the visitor is on), the composer pages and their tests.
 * Copy and type lists are Figma's (p23–p29). The Security vulnerability
 * option is styled like the rest, as in Figma — confidential routing is a
 * backend concern (M2), not a visual one.
 */
export const REPORT_KINDS: Record<ReportKind, ReportKindConfig> = {
  feedback: {
    title: "Send a feedback",
    sheetTitle: "Feedback type",
    ctaLabel: "Send feedback",
    messageLabel: "Your feedback",
    placeholder: "Please develop your feedback for a better administration of your request.",
    sentTitle: "Feedback sent",
    sentBody: "Thank you for your feedback.",
    types: [
      { key: "feature_request", label: "Feature request", description: "Asks for new capability" },
      { key: "enhancement", label: "Enhancement", description: "Improve existing capability" },
      { key: "ux_friction", label: "UX friction", description: "Usable but confusing/inefficient" },
      { key: "content_suggestion", label: "Content suggestion", description: "Wording, documentation, copy" },
      { key: "comparison", label: "Comparison", description: "References a competitor product" },
      { key: "praise", label: "Praise", description: "Unsolicited compliment" },
    ],
  },
  issue: {
    title: "Report an issue",
    sheetTitle: "Issue type",
    ctaLabel: "Report issue",
    messageLabel: "Your issue report",
    placeholder: "Please develop your issue for a better administration of your request.",
    sentTitle: "Issue reported",
    sentBody: "Thank you for reporting this issue.",
    types: [
      { key: "functional_bug", label: "Functional bug", description: "Feature doesn't behave as specified" },
      { key: "visual_bug", label: "Visual bug", description: "UI/rendering/layout defect" },
      { key: "crash", label: "Crash", description: "Application termination or freeze" },
      { key: "performance", label: "Performance", description: "Slowness, lag, timeout, resource usage" },
      { key: "data_loss", label: "Data loss", description: "User data corrupted, missing, or deleted" },
      { key: "security_vulnerability", label: "Security vulnerability", description: "Exploitable flaw (routes to security team, not public triage)" },
      { key: "accessibility", label: "Accessibility", description: "WCAG/a11y non-conformance" },
      { key: "broken_link", label: "Broken link", description: "404, dead link, misrouted navigation" },
      { key: "compatibility", label: "Compatibility", description: "Browser/OS/device-specific failure" },
    ],
  },
};

/** "/feedback" | "/issue" as plain hrefs (page-action rows) → their report kind. */
export function reportKindForHref(href: string): ReportKind | undefined {
  if (href === "/feedback") return "feedback";
  if (href === "/issue") return "issue";
  return undefined;
}

/** The API keys of these labels, in the kind's own order (unknown labels are dropped). */
export function typeKeys(kind: ReportKind, labels: Iterable<string>): string[] {
  const wanted = new Set(labels);
  return REPORT_KINDS[kind].types.filter((type) => wanted.has(type.label)).map((type) => type.key);
}

/** Keeps only labels of this kind's types, in the kind's own order, without duplicates. */
export function knownTypes(kind: ReportKind, labels: Iterable<string>): string[] {
  const wanted = new Set(labels);
  return REPORT_KINDS[kind].types.map((type) => type.label).filter((label) => wanted.has(label));
}
