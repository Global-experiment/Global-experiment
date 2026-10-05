"use client";

import { useId, useState, useSyncExternalStore } from "react";
import { buildReportSubmission, type ReportSubmissionDraft } from "@/shared/navigation/reportSubmission";
import type { ReportKind } from "@/shared/navigation/sourcePage";
import { parseReportDraft, readReportDraftRaw, reportDraftKey, writeReportDraft } from "@/shared/report/reportDraft";
import { REPORT_KINDS } from "@/shared/report/reportKinds";
import { composerContextFromSearch, composerHref } from "@/shared/report/reportLinks";
import { ReportQualificationSheet } from "@/shared/report/ReportQualificationSheet";
import { Button } from "@/shared/ui/Button";
import { Container } from "@/shared/ui/Container";
import { InertActionNotice } from "@/shared/ui/InertActionNotice";
import { NavHeader } from "@/shared/ui/NavHeader";
import { StickyActionBar } from "@/shared/ui/StickyActionBar";

// Location and sessionStorage are read on the client only (server snapshot:
// null), so the page stays static and hydration never mismatches; the
// values then appear in the first client render.
const noSubscribe = () => () => {};

/**
 * The paragraph step of Send feedback (figma.pdf p24–25, p35) and Report an
 * issue (p28–29). Qualification normally happens BEFORE this page, over the
 * page the visitor came from (ReportLauncher, Review #3 item 5): the URL then
 * carries `qualified=1`, the chosen types and the origin page, and this
 * page opens straight to the paragraph. Reached directly (typed URL, new
 * tab, no JavaScript yet), it asks for the qualification itself.
 *
 * The unsent paragraph is kept in sessionStorage per kind + origin page and
 * restored on return (Review #3 item 6). M1 sends nothing: the CTA builds
 * the submission draft and shows the inert-action notice, and does NOT clear
 * the stored paragraph — only a real (M2) submission will.
 */
export function ReportComposer({ kind }: { kind: ReportKind }) {
  const config = REPORT_KINDS[kind];
  const messageId = useId();
  const search = useSyncExternalStore(noSubscribe, () => window.location.search, () => null);
  const context = search === null ? null : composerContextFromSearch(kind, search);
  const sourcePage = context?.sourcePage ?? null;
  const draftKey = reportDraftKey(kind, sourcePage);
  const storedRaw = useSyncExternalStore(noSubscribe, () => readReportDraftRaw(draftKey), () => null);
  const stored = parseReportDraft(kind, storedRaw);

  // null = untouched in this visit → show what was stored.
  const [typed, setTyped] = useState<string | null>(null);
  const [pickedTypes, setPickedTypes] = useState<string[] | null>(null);
  const [pickerDismissed, setPickerDismissed] = useState(false);
  const [submission, setSubmission] = useState<ReportSubmissionDraft | null>(null);

  const message = typed ?? stored?.message ?? "";
  const types = context?.qualified ? context.types : (pickedTypes ?? stored?.types ?? []);
  const needsQualification = context !== null && !context.qualified && pickedTypes === null && !pickerDismissed;

  function changeMessage(value: string) {
    setTyped(value);
    writeReportDraft(draftKey, { message: value, types });
  }

  return (
    <main
      className="flex flex-1 flex-col"
      data-source-page={sourcePage ?? undefined}
      data-report-types={types.join("|")}
    >
      <NavHeader title={config.title} backHref={sourcePage ?? "/"} />
      {/* figma.pdf p24/p28: composer text starts 8px under the header. */}
      <Container className="flex flex-1 flex-col pt-2">
        <label htmlFor={messageId} className="sr-only">
          {config.messageLabel}
        </label>
        {/*
          No border, no focus outline and no background change on focus
          (client feedback item 22 and the final pass) — the caret marks
          focus. Native suggestions and spellcheck stay on.
        */}
        <textarea
          id={messageId}
          value={message}
          onChange={(event) => changeMessage(event.target.value)}
          placeholder={config.placeholder}
          rows={8}
          inputMode="text"
          autoCorrect="on"
          autoCapitalize="sentences"
          spellCheck
          className="w-full flex-1 resize-none bg-transparent text-lead text-text-primary placeholder:text-text-muted focus:outline-none"
        />
        {submission ? <InertActionNotice /> : null}
      </Container>

      <StickyActionBar>
        {message.trim() === "" ? (
          <Button disabled fullWidth>
            {config.ctaLabel}
          </Button>
        ) : (
          <Button variant="primary" fullWidth onClick={() => setSubmission(buildReportSubmission({ kind, message, types, sourcePage }))}>
            {config.ctaLabel}
          </Button>
        )}
      </StickyActionBar>

      {context !== null && !context.qualified ? (
        <ReportQualificationSheet
          kind={kind}
          open={needsQualification}
          initialTypes={stored?.types}
          onClose={() => setPickerDismissed(true)}
          onConfirm={(chosen) => {
            setPickedTypes(chosen);
            if (message.trim() !== "") writeReportDraft(draftKey, { message, types: chosen });
            // Record the qualification in the URL so a reload doesn't ask again.
            window.history.replaceState(null, "", composerHref(kind, sourcePage, chosen));
          }}
        />
      ) : null}
    </main>
  );
}
