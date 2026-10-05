import { ReportComposer } from "../ReportComposer";

/**
 * M1 navigation scaffold. Qualification, the paragraph and its session
 * draft are real UI state; submitting does not persist anything, call AI
 * qualification, or create a Notion entry — that pipeline is M2. Copy and
 * types live in src/shared/report/reportKinds.ts. See
 * docs/architecture/decisions/008-route-shells.md.
 */
export default function FeedbackPage() {
  return <ReportComposer kind="feedback" />;
}
