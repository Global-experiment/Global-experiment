"use client";

import { useState } from "react";
import { Button } from "@/shared/ui/Button";
import { Container } from "@/shared/ui/Container";
import { NavHeader } from "@/shared/ui/NavHeader";
import { InertActionNotice } from "@/shared/ui/InertActionNotice";

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
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);

  function toggle(label: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  return (
    <main className="flex flex-1 flex-col">
      <NavHeader title="Send a feedback" backHref="/" />
      <Container className="flex flex-col gap-6 py-6">
        <fieldset>
          <legend className="mb-2 text-sm font-bold text-text-primary">Feedback type</legend>
          <div>
            {FEEDBACK_TYPES.map((type) => (
              <label
                key={type.label}
                className="flex cursor-pointer items-start gap-3 border-b border-border-faint py-3"
              >
                <input
                  type="checkbox"
                  checked={selected.has(type.label)}
                  onChange={() => toggle(type.label)}
                  className="mt-1 h-4 w-4"
                />
                <span>
                  <span className="block text-sm font-bold text-text-primary">{type.label}</span>
                  <span className="block text-sm text-text-muted">{type.description}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <label htmlFor="feedback-message" className="sr-only">
            Please develop your feedback
          </label>
          <textarea
            id="feedback-message"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            rows={5}
            placeholder="Please develop your feedback for a better administration of your request."
            className="w-full rounded-control border border-border-subtle bg-transparent px-4 py-3 text-sm text-text-primary placeholder:text-text-muted"
          />
        </div>

        <Button variant="primary" onClick={() => setSubmitted(true)} fullWidth>
          Send feedback
        </Button>
        {submitted ? <InertActionNotice /> : null}
      </Container>
    </main>
  );
}
