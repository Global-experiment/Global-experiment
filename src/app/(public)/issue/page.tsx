"use client";

import { useState } from "react";
import { Button } from "@/shared/ui/Button";
import { Container } from "@/shared/ui/Container";
import { NavHeader } from "@/shared/ui/NavHeader";
import { InertActionNotice } from "@/shared/ui/InertActionNotice";

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
      <NavHeader title="Report an issue" backHref="/" />
      <Container className="flex flex-col gap-6 py-6">
        <fieldset>
          <legend className="mb-2 text-sm font-bold text-text-primary">Issue type</legend>
          <div>
            {ISSUE_TYPES.map((type) => (
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
          <label htmlFor="issue-message" className="sr-only">
            Please develop your issue
          </label>
          <textarea
            id="issue-message"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            rows={5}
            placeholder="Please develop your issue for a better administration of your request."
            className="w-full rounded-control border border-border-subtle bg-transparent px-4 py-3 text-sm text-text-primary placeholder:text-text-muted"
          />
        </div>

        <Button variant="primary" onClick={() => setSubmitted(true)} fullWidth>
          Report issue
        </Button>
        {submitted ? <InertActionNotice /> : null}
      </Container>
    </main>
  );
}
