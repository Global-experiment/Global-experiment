"use client";

import { useId, useState } from "react";
import { Button } from "@/shared/ui/Button";
import { Container } from "@/shared/ui/Container";
import { NavHeader } from "@/shared/ui/NavHeader";
import { Sheet } from "@/shared/ui/Sheet";
import { StickyActionBar } from "@/shared/ui/StickyActionBar";
import { InertActionNotice } from "@/shared/ui/InertActionNotice";

export interface ReportType {
  label: string;
  description: string;
}

interface ReportComposerProps {
  title: string;
  messageLabel: string;
  placeholder: string;
  ctaLabel: string;
  typeSheetTitle: string;
  types: ReportType[];
}

/**
 * Shared presentation for Send feedback (figma.pdf p23–25, p35) and
 * Report an issue (p27–29): a borderless 16px composer under the header,
 * a bottom CTA that is gray until something is written, and — on the CTA
 * — the type-selection sheet (bottom sheet on mobile, centered dialog on
 * desktop) with checkbox rows and the white confirm button.
 *
 * Nothing is sent or stored: confirming shows the inert-action notice.
 * The M2 pipeline (persistence, qualification) plugs in behind the same UI.
 */
export function ReportComposer({
  title,
  messageLabel,
  placeholder,
  ctaLabel,
  typeSheetTitle,
  types,
}: ReportComposerProps) {
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sheetOpen, setSheetOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const messageId = useId();

  function toggle(label: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  return (
    <main className="flex flex-1 flex-col pb-16">
      <NavHeader title={title} backHref="/" />
      <Container className="flex flex-1 flex-col pt-1">
        <label htmlFor={messageId} className="sr-only">
          {messageLabel}
        </label>
        <textarea
          id={messageId}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder={placeholder}
          rows={8}
          className="w-full flex-1 resize-none bg-transparent text-lead text-text-primary placeholder:text-text-muted focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-4 focus-visible:outline-line"
        />
        {submitted ? <InertActionNotice /> : null}
      </Container>

      <StickyActionBar>
        {message.trim() === "" ? (
          <Button disabled fullWidth>
            {ctaLabel}
          </Button>
        ) : (
          <Button variant="primary" fullWidth onClick={() => setSheetOpen(true)}>
            {ctaLabel}
          </Button>
        )}
      </StickyActionBar>

      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title={typeSheetTitle}>
        <fieldset>
          <legend className="sr-only">{typeSheetTitle}</legend>
          <div className="divide-y divide-line">
            {types.map((type) => (
              <label key={type.label} className="flex cursor-pointer items-start gap-1 py-2.5">
                <input
                  type="checkbox"
                  checked={selected.has(type.label)}
                  onChange={() => toggle(type.label)}
                  className="mt-px size-4 shrink-0 accent-white"
                />
                <span>
                  <span className="block text-body text-text-primary">{type.label}</span>
                  <span className="mt-1 block text-meta text-text-muted">{type.description}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <Button
          variant="primary"
          fullWidth
          className="mt-3"
          onClick={() => {
            setSheetOpen(false);
            setSubmitted(true);
          }}
        >
          {ctaLabel}
        </Button>
      </Sheet>
    </main>
  );
}
