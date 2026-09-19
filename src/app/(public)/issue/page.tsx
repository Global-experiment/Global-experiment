import { ReportComposer } from "../ReportComposer";

const ISSUE_TYPES = [
  { label: "Functional bug", description: "Feature doesn't behave as specified" },
  { label: "Visual bug", description: "UI/rendering/layout defect" },
  { label: "Crash", description: "Application termination or freeze" },
  { label: "Performance", description: "Slowness, lag, timeout, resource usage" },
  { label: "Data loss", description: "User data corrupted, missing, or deleted" },
  {
    label: "Security vulnerability",
    description: "Exploitable flaw (routes to security team, not public triage)",
  },
  { label: "Accessibility", description: "WCAG/a11y non-conformance" },
  { label: "Broken link", description: "404, dead link, misrouted navigation" },
  { label: "Compatibility", description: "Browser/OS/device-specific failure" },
];

/**
 * M1 navigation scaffold. Type selection and the message field are real UI
 * state; submitting does not persist anything, call AI qualification, or
 * create a Notion entry — that pipeline is M2. The Security vulnerability
 * option is styled identically to the rest, matching the Figma source
 * (the confidential-handling requirement is a backend routing concern, not
 * a visual one). See docs/architecture/decisions/008-route-shells.md.
 */
export default function IssuePage() {
  return (
    <ReportComposer
      title="Report an issue"
      messageLabel="Your issue report"
      placeholder="Please develop your issue for a better administration of your request."
      ctaLabel="Report issue"
      typeSheetTitle="Issue type"
      types={ISSUE_TYPES}
    />
  );
}
