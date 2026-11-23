"use client";

import { useId, useState, useSyncExternalStore } from "react";
import { buildReportSubmission, REPORT_MESSAGE_LIMIT } from "@/shared/navigation/reportSubmission";
import type { ReportKind } from "@/shared/navigation/sourcePage";
import { clearReportDraft, parseReportDraft, readReportDraftRaw, reportDraftKey, writeReportDraft } from "@/shared/report/reportDraft";
import { REPORT_KINDS } from "@/shared/report/reportKinds";
import { composerContextFromSearch, composerHref } from "@/shared/report/reportLinks";
import { ReportQualificationSheet } from "@/shared/report/ReportQualificationSheet";
import { REPORT_ERROR_MESSAGES, submitReport, type ReportOutcome } from "@/shared/report/submitReport";
import { BotCheckError, useBotCheck } from "@/shared/report/useBotCheck";
import { Button } from "@/shared/ui/Button";
import { Container } from "@/shared/ui/Container";
import { NavHeader } from "@/shared/ui/NavHeader";
import { StickyActionBar } from "@/shared/ui/StickyActionBar";

// Location and sessionStorage are read on the client only (server snapshot:
// null), so the page stays static and hydration never mismatches; the
// values then appear in the first client render.
const noSubscribe = () => () => {};

/** Within this many characters of the limit, the composer says what the limit is. */
const LIMIT_HINT_FROM = 200;

type SendState = { phase: "idle" } | { phase: "sending" } | { phase: "sent" } | { phase: "failed"; outcome: Exclude<ReportOutcome, "sent"> };

/**
 * The paragraph step of Send feedback (figma.pdf p24–25, p35) and Report an
 * issue (p28–29). Qualification normally happens BEFORE this page, over the
 * page the visitor came from (ReportLauncher, Review #3 item 5): the URL then
 * carries `qualified=1`, the chosen types and the origin page, and this
 * page opens straight to the paragraph. Reached directly (typed URL, new
 * tab, no JavaScript yet), it asks for the qualification itself.
 *
 * The unsent paragraph is kept in sessionStorage per kind + origin page and
 * restored on return (Review #3 item 6). Sending runs the bot check (ADR 023)
 * and posts the submission; the stored paragraph is cleared only once the
 * API has saved it, and kept on any failure.
 */
export function ReportComposer({ kind }: { kind: ReportKind }) {
  const config = REPORT_KINDS[kind];
  const messageId = useId();
  const hintId = useId();
  const search = useSyncExternalStore(
    noSubscribe,
    () => window.location.search,
    () => null,
  );
  const context = search === null ? null : composerContextFromSearch(kind, search);
  const sourcePage = context?.sourcePage ?? null;
  const draftKey = reportDraftKey(kind, sourcePage);
  const storedRaw = useSyncExternalStore(
    noSubscribe,
    () => readReportDraftRaw(draftKey),
    () => null,
  );
  const stored = parseReportDraft(kind, storedRaw);
  const { containerRef: botCheckRef, run: runBotCheck } = useBotCheck(kind);

  // null = untouched in this visit → show what was stored.
  const [typed, setTyped] = useState<string | null>(null);
  const [pickedTypes, setPickedTypes] = useState<string[] | null>(null);
  const [pickerDismissed, setPickerDismissed] = useState(false);
  const [send, setSend] = useState<SendState>({ phase: "idle" });

  const message = typed ?? stored?.message ?? "";
  const types = context?.qualified ? context.types : (pickedTypes ?? stored?.types ?? []);
  const needsQualification = context !== null && !context.qualified && pickedTypes === null && !pickerDismissed;
  const remaining = REPORT_MESSAGE_LIMIT - message.length;

  function changeMessage(value: string) {
    setTyped(value);
    if (send.phase === "failed") setSend({ phase: "idle" });
    writeReportDraft(draftKey, { message: value, types });
  }

  async function sendReport() {
    setSend({ phase: "sending" });
    let token: string;
    try {
      token = await runBotCheck();
    } catch (error) {
      return setSend({ phase: "failed", outcome: error instanceof BotCheckError && error.reason === "failed" ? "bot_check_failed" : "unavailable" });
    }
    const locale = typeof navigator === "undefined" ? null : navigator.language;
    const outcome = await submitReport(buildReportSubmission({ kind, message, types, sourcePage, locale }), token);
    if (outcome !== "sent") return setSend({ phase: "failed", outcome });
    clearReportDraft(draftKey);
    setSend({ phase: "sent" });
  }

  if (send.phase === "sent") {
    return (
      <main className="flex flex-1 flex-col">
        <NavHeader title={config.title} backHref={sourcePage ?? "/"} />
        {/* As the donation thank-you (Common pages p33): heading 4px under the header, text 4px under it. */}
        <Container className="pt-1 text-body text-text-primary">
          <div role="status">
            <h2 className="font-bold">{config.sentTitle}</h2>
            <p className="mt-1">{config.sentBody}</p>
          </div>
        </Container>
        <StickyActionBar>
          <Button href={sourcePage ?? "/"} variant="secondary" fullWidth>
            Back to the page
          </Button>
        </StickyActionBar>
      </main>
    );
  }

  const sending = send.phase === "sending";
  return (
    <main className="flex flex-1 flex-col" data-source-page={sourcePage ?? undefined} data-report-types={types.join("|")}>
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
          maxLength={REPORT_MESSAGE_LIMIT}
          readOnly={sending}
          aria-describedby={remaining <= LIMIT_HINT_FROM ? hintId : undefined}
          inputMode="text"
          autoCorrect="on"
          autoCapitalize="sentences"
          spellCheck
          className="w-full flex-1 resize-none bg-transparent text-lead text-text-primary placeholder:text-text-muted focus:outline-none"
        />
        {remaining <= LIMIT_HINT_FROM ? (
          <p id={hintId} className="mt-2 text-body text-text-muted">
            Up to 5,000 characters.
          </p>
        ) : null}
        {/* Cloudflare's check: empty unless it needs the visitor to interact. */}
        <div ref={botCheckRef} className="mt-2 empty:hidden" />
        <p role="alert" className="mt-3 text-body text-text-primary empty:mt-0">
          {send.phase === "failed" ? REPORT_ERROR_MESSAGES[send.outcome] : null}
        </p>
      </Container>

      <StickyActionBar>
        {message.trim() === "" || sending ? (
          <Button disabled fullWidth>
            {sending ? "Sending…" : config.ctaLabel}
          </Button>
        ) : (
          <Button variant="primary" fullWidth onClick={() => void sendReport()}>
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
