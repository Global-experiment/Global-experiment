import { ReportComposer } from "../ReportComposer";

const FEEDBACK_TYPES = [
  { label: "Feature request", description: "Asks for new capability" },
  { label: "Enhancement", description: "Improve existing capability" },
  { label: "UX friction", description: "Usable but confusing/inefficient" },
  { label: "Content suggestion", description: "Wording, documentation, copy" },
  { label: "Comparison", description: "References a competitor product" },
  { label: "Praise", description: "Unsolicited compliment" },
];

/**
 * M1 navigation scaffold. Type selection and the message field are real UI
 * state; submitting does not persist anything, call AI qualification, or
 * create a Notion entry — that pipeline is M2. See
 * docs/architecture/decisions/008-route-shells.md.
 */
export default function FeedbackPage() {
  return (
    <ReportComposer
      title="Send a feedback"
      messageLabel="Your feedback"
      placeholder="Please develop your feedback for a better administration of your request."
      ctaLabel="Send feedback"
      typeSheetTitle="Feedback type"
      types={FEEDBACK_TYPES}
    />
  );
}
