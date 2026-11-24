import { ReportComposer } from "../ReportComposer";

/**
 * The composer (ReportComposer): qualification, the paragraph and its
 * session draft, then the send, checked by Cloudflare Turnstile (ADR 023)
 * and saved by the API for the admins (Feedbacks and issues). The automatic
 * qualification comes later. Copy and types live in
 * src/shared/report/reportKinds.ts.
 */
export default function FeedbackPage() {
  return <ReportComposer kind="feedback" />;
}
