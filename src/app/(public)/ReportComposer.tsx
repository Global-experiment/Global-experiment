"use client";

import { useId, useState, useSyncExternalStore } from "react";
import { buildReportSubmission, type ReportSubmissionDraft } from "@/shared/navigation/reportSubmission";
import { sourcePageFromSearch, type ReportKind } from "@/shared/navigation/sourcePage";
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
  kind: ReportKind;
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
 * Nothing is sent or stored: confirming builds the submission draft
 * (message, types and the validated `?source=` page) and shows the
 * inert-action notice. The M2 pipeline (persistence, qualification) plugs
 * in behind the same UI and posts that draft.
 */
const noSubscribe = () => () => {};

export function ReportComposer({
  kind,
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
  const [draft, setDraft] = useState<ReportSubmissionDraft | null>(null);
  const messageId = useId();
  // Read on the client only so the page stays static (no useSearchParams Suspense boundary).
  const search = useSyncExternalStore(noSubscribe, () => window.location.search, () => "");
  const sourcePage = sourcePageFromSearch(search);

  function toggle(label: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  return (
    <main className="flex flex-1 flex-col" data-source-page={sourcePage ?? undefined}>
      <NavHeader title={title} backHref={sourcePage ?? "/"} />
      {/* figma.pdf p24/p28: composer text starts 8px under the header. */}
      <Container className="flex flex-1 flex-col pt-2">
        <label htmlFor={messageId} className="sr-only">
          {messageLabel}
        </label>
        {/*
          No border, no focus outline and no background change on focus
          (client feedback item 22 and the final pass) — the caret marks
          focus. Native suggestions and spellcheck stay on.
        */}
        <textarea
          id={messageId}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder={placeholder}
          rows={8}
          inputMode="text"
          autoCorrect="on"
          autoCapitalize="sentences"
          spellCheck
          className="w-full flex-1 resize-none bg-transparent text-lead text-text-primary placeholder:text-text-muted focus:outline-none"
        />
        {draft ? <InertActionNotice /> : null}
      </Container>

      <StickyActionBar>
        {message.trim() === "" ? (
          <Button disabled fullWidth>
            {ctaLabel}
          </Button>
        ) : (
          <Button variant="primary" fullWidth onClick={() => setDraft(buildReportSubmission({ kind, message, types: selected, sourcePage }))}>
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
