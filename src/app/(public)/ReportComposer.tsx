"use client";

import { useId, useState } from "react";
import { Button } from "@/shared/ui/Button";
import { Checkbox } from "@/shared/ui/Checkbox";
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
 * Report an issue (p27–29). The type-selection sheet opens first, before
 * the composer is reachable at all (client feedback item 20 — reversing
 * the earlier "compose, then pick a type" order): the page mounts with it
 * open, and only shows the paragraph composer once it's been dismissed
 * (by its own CTA, Escape, or the backdrop — type selection was already
 * optional multi-select, never required to proceed).
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
  const [typeSheetOpen, setTypeSheetOpen] = useState(true);
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
    <main className="flex flex-1 flex-col">
      <NavHeader title={title} backHref="/" />
      {/* figma.pdf p24/p28: composer text starts 8px under the header. */}
      <Container className="flex flex-1 flex-col pt-2">
        <label htmlFor={messageId} className="sr-only">
          {messageLabel}
        </label>
        {/*
          No border, no focus outline (client feedback item 22) — a subtle
          background tint marks focus instead, so keyboard users still get
          a visible (if quiet) indicator.
        */}
        <textarea
          id={messageId}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder={placeholder}
          rows={8}
          className="w-full flex-1 resize-none bg-transparent text-lead text-text-primary placeholder:text-text-muted transition-colors focus:bg-text-primary/5 focus:outline-none"
        />
        {submitted ? <InertActionNotice /> : null}
      </Container>

      <StickyActionBar>
        {message.trim() === "" ? (
          <Button disabled fullWidth>
            {ctaLabel}
          </Button>
        ) : (
          <Button variant="primary" fullWidth onClick={() => setSubmitted(true)}>
            {ctaLabel}
          </Button>
        )}
      </StickyActionBar>

      <Sheet open={typeSheetOpen} onClose={() => setTypeSheetOpen(false)} title={typeSheetTitle} headerVariant="picker">
        {/*
          figma.pdf p23/p27: 54px rows (8px top, label, 5px, description,
          8px bottom, then a full-width 1px rule under every row, the last
          one included); the list tucks 3px up under the title row; the CTA
          sits 8px under the last rule.
        */}
        <fieldset className="-mt-[0.1875rem]">
          <legend className="sr-only">{typeSheetTitle}</legend>
          {types.map((type) => (
            <Checkbox
              key={type.label}
              checked={selected.has(type.label)}
              onChange={() => toggle(type.label)}
              label={type.label}
              description={type.description}
              className="-mx-gutter border-b border-line px-gutter pt-2 pb-2"
            />
          ))}
        </fieldset>
        <Button variant="primary" fullWidth className="mt-2" onClick={() => setTypeSheetOpen(false)}>
          {ctaLabel}
        </Button>
      </Sheet>
    </main>
  );
}
