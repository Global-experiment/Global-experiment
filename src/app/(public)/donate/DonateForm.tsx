"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import type { DonationConfig, DonationMethodKey, DonationSummary } from "@/shared/config/publicApi";
import { DONATE_COPY } from "@/shared/donate/copy";
import { donateHref, type DonateUrlState, type DonationFrequency } from "@/shared/donate/donateParams";
import {
  DONATION_CURRENCIES,
  formatCount,
  formatExact,
  formatMedian,
  formatTotal,
  formatWhole,
  minorToAmountText,
  parseAmountToMinor,
  type DonationCurrency,
} from "@/shared/donate/money";
import { ClickableStatsRow, type StatItem } from "@/shared/treasury/ClickableStatsRow";
import { Button, buttonClasses } from "@/shared/ui/Button";
import { Container } from "@/shared/ui/Container";
import { FullBleedSeparator } from "@/shared/ui/FullBleedSeparator";
import { IconButton } from "@/shared/ui/IconButton";
import { Icon } from "@/shared/ui/icons";
import { NavHeader } from "@/shared/ui/NavHeader";
import { PageActionsMenu } from "@/shared/ui/PageActionsMenu";
import { shareUrl } from "@/shared/ui/ShareButton";
import { Sheet } from "@/shared/ui/Sheet";
import { StickyActionBar } from "@/shared/ui/StickyActionBar";
import { DonateNotice, type DonateNoticeContent } from "./DonateNotice";
import { PaymentMarks } from "./PaymentMarks";

const copy = DONATE_COPY;

/** The decided rules, for when the API can't be reached (the page still renders, donations are just unavailable). */
const FALLBACK_PRESETS = [2, 5, 10, 20, 50];

// Only digits and at most one decimal point/comma — never rely on the
// browser's native number-input spinner (client feedback item 26).
const DECIMAL_INPUT = /^[0-9]*[.,]?[0-9]*$/;

const focusRing = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary";

/** Amount and frequency controls while donations are closed or unavailable: visibly inert, never "selected". */
const inertControl = "cursor-not-allowed border-line text-content-50";

type Selection = { kind: "preset"; major: number } | { kind: "other"; text: string; editing: boolean } | null;

interface DonateFormProps {
  config: DonationConfig | null;
  summary: DonationSummary | null;
  initial: DonateUrlState;
  /** "October 15 at 9:30AM" (Europe/Zurich), formatted on the server; null before the first entry. */
  lastUpdated: string | null;
}

function initialSelection(initial: DonateUrlState, presets: readonly number[]): Selection {
  if (initial.amountMinor === null) return null;
  const preset = presets.find((major) => major * 100 === initial.amountMinor);
  if (preset !== undefined) return { kind: "preset", major: preset };
  return { kind: "other", text: minorToAmountText(initial.amountMinor), editing: false };
}

const selectedMinor = (selection: Selection) =>
  selection === null ? null : selection.kind === "preset" ? selection.major * 100 : parseAmountToMinor(selection.text);

/**
 * Donate (Common pages.pdf p28–p31): currency in the header (kept in the
 * URL), real Treasury figures, Once/Monthly (only while monthly donations
 * are on), the amount presets and "Other", the payment rows the settings
 * allow, and the approved legal text. A payment row opens Stripe Checkout;
 * nothing about the donor is collected here.
 */
export function DonateForm({ config, summary, initial, lastUpdated }: DonateFormProps) {
  const router = useRouter();
  const available = config?.available === true;
  // Closed until donations open; a valid preview token opens it for this visitor only.
  const open = config?.enabled === true;
  // Amounts and frequency can be chosen only when a payment can follow.
  const interactive = available && open;
  const preview = initial.preview;
  const presets = config?.presets ?? FALLBACK_PRESETS;
  const monthlyEnabled = config?.monthly === true;

  const [currency, setCurrency] = useState<DonationCurrency>(initial.currency);
  const [frequency, setFrequency] = useState<DonationFrequency>(initial.frequency);
  const [selection, setSelection] = useState<Selection>(() => (interactive ? initialSelection(initial, presets) : null));
  const [notice, setNotice] = useState<DonateNoticeContent | null>(() =>
    !config || !available
      ? { tone: "warning", ...copy.notices.donationsUnavailable }
      : !open
        ? { tone: "info", ...copy.notices.openSoon }
        : initial.canceled
        ? { tone: "info", ...copy.notices.canceled }
        : null,
  );
  const [busy, setBusy] = useState<DonationMethodKey | null>(null);
  const [currencyOpen, setCurrencyOpen] = useState(false);
  // One id per visit: a double click opens the same Checkout (the API's idempotency key).
  const [attemptId] = useState(() => crypto.randomUUID());
  const noticeRef = useRef<HTMLDivElement>(null);
  const otherRef = useRef<HTMLInputElement>(null);

  // "canceled=1" is a one-time message: drop it from the address bar so a reload doesn't repeat it.
  useEffect(() => {
    if (initial.canceled)
      window.history.replaceState(
        null,
        "",
        donateHref({ currency: initial.currency, amountText: initial.amountMinor === null ? null : minorToAmountText(initial.amountMinor), frequency: initial.frequency, preview: initial.preview }),
      );
  }, [initial]);

  // Back from Stripe through the browser's back button (page restored from the bfcache): ready again.
  useEffect(() => {
    const onShow = (event: PageTransitionEvent) => {
      if (event.persisted) setBusy(null);
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

  const amountMinor = selectedMinor(selection);
  const amountText = amountMinor === null ? null : minorToAmountText(amountMinor);

  const show = (next: DonateNoticeContent) => {
    setNotice(next);
    // Bring it into view on small screens; the role announces it.
    requestAnimationFrame(() => noticeRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  };

  const syncUrl = (next: { currency?: DonationCurrency; frequency?: DonationFrequency; amountText?: string | null }) => {
    router.replace(
      donateHref({ currency: next.currency ?? currency, frequency: next.frequency ?? frequency, amountText: next.amountText === undefined ? amountText : next.amountText, preview }),
      { scroll: false },
    );
  };

  /** Field issue for the current amount, or null when it can go to Stripe. */
  const amountIssue = (minor: number | null, typed: boolean): DonateNoticeContent | null => {
    const minimum = config?.minimum ?? 1;
    const maximum = config?.maximum ?? 10_000;
    if (minor === null)
      return typed ? { tone: "warning", title: copy.notices.invalidAmount.title, message: copy.notices.format } : { tone: "warning", ...copy.notices.selectAmount };
    if (minor < minimum * 100) return { tone: "warning", title: copy.notices.invalidAmount.title, message: copy.notices.minimum(formatWhole(minimum, currency)) };
    if (minor > maximum * 100) return { tone: "warning", title: copy.notices.invalidAmount.title, message: copy.notices.maximum(formatWhole(maximum, currency)) };
    return null;
  };

  const validateOther = () => {
    if (selection?.kind !== "other") return;
    const issue = amountIssue(parseAmountToMinor(selection.text), selection.text.trim() !== "");
    if (issue) {
      show(issue);
      otherRef.current?.focus();
      return;
    }
    setNotice(null);
    setSelection({ ...selection, editing: false });
    syncUrl({ amountText: minorToAmountText(parseAmountToMinor(selection.text)!) });
  };

  const chooseCurrency = (next: DonationCurrency) => {
    setCurrencyOpen(false);
    if (next === currency) return;
    setCurrency(next);
    if (notice?.title !== copy.notices.donationsUnavailable.title && notice?.title !== copy.notices.openSoon.title) setNotice(null);
    syncUrl({ currency: next });
  };

  const chooseFrequency = (next: DonationFrequency) => {
    setFrequency(next);
    syncUrl({ frequency: next });
  };

  const choosePreset = (major: number) => {
    setSelection({ kind: "preset", major });
    if (notice?.tone === "warning" && available && open) setNotice(null);
    syncUrl({ amountText: String(major) });
  };

  const startOther = () => {
    setSelection((current) => (current?.kind === "other" ? { ...current, editing: true } : { kind: "other", text: "", editing: true }));
  };

  async function donate(method: DonationMethodKey) {
    if (busy) return;
    if (!available) return show({ tone: "warning", ...copy.notices.donationsUnavailable });
    if (!open) return show({ tone: "info", ...copy.notices.openSoon });
    const typed = selection?.kind === "other" && selection.text.trim() !== "";
    const issue = amountIssue(amountMinor, typed);
    if (issue) return show(issue);

    setNotice(null);
    setBusy(method);
    if (selection?.kind === "other") setSelection({ ...selection, editing: false });
    try {
      const response = await fetch("/api/donations/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amount: amountText, currency, frequency, method, attemptId, ...(preview ? { previewToken: preview } : {}) }),
      });
      const body = (await response.json().catch(() => null)) as {
        url?: string;
        error?: { details?: { reason?: string; issues?: { path: string; message: string }[] } };
      } | null;
      if (response.ok && body?.url) {
        // Leaving for Stripe: the row keeps its "Redirecting…" state until the page unloads.
        window.location.assign(body.url);
        return;
      }
      setBusy(null);
      const firstIssue = body?.error?.details?.issues?.[0];
      if (response.status === 400 && firstIssue) {
        show({
          tone: "warning",
          title: firstIssue.path === "amount" ? copy.notices.invalidAmount.title : copy.notices.methodUnavailable.title,
          message: firstIssue.message,
        });
      } else if (response.status === 403 && body?.error?.details?.reason === "donations_closed") {
        show({ tone: "info", ...copy.notices.openSoon });
      } else if (response.status === 429) {
        show({ tone: "warning", ...copy.notices.rateLimited });
      } else {
        show({ tone: "warning", ...copy.notices.stripeUnavailable });
      }
    } catch {
      setBusy(null);
      show({ tone: "warning", ...copy.notices.stripeUnavailable });
    }
  }

  // No payment rows until donations open: nothing to click that would be refused.
  const methods = open ? (config?.methods ?? []).filter((method) => method.currencies.includes(currency) && method.frequencies.includes(frequency)) : [];
  const stats = summary ? buildStats(summary, monthlyEnabled) : null;
  const editingOther = selection?.kind === "other" && selection.editing;

  return (
    <main className="flex flex-1 flex-col pb-6">
      <NavHeader
        title={copy.pageTitle}
        backHref="/"
        actions={
          <>
            {/* Common pages p28: "USD" bold, ending 8px before the Treasury glyph. */}
            <button
              type="button"
              onClick={() => setCurrencyOpen(true)}
              aria-label={copy.header.currencyLabel(currency)}
              aria-haspopup="dialog"
              className={`h-10 shrink-0 cursor-pointer rounded-control px-2 text-body font-bold text-text-primary ${focusRing}`}
            >
              {currency}
            </button>
            <IconButton href="/treasury" label={copy.header.treasuryLink} icon="leaderboard" />
            <PageActionsMenu
              label={copy.header.pageActions}
              actions={[
                { label: copy.menu.donate, icon: "volunteer_activism", href: "#donate-amount" },
                // Never shares the private preview token.
                { label: copy.menu.share, icon: "share", onClick: () => void shareUrl(donateHref({ currency }), copy.pageTitle) },
                { label: copy.menu.feedback, icon: "lightbulb", href: "/feedback" },
                { label: copy.menu.issue, icon: "new_releases", href: "/issue" },
                { label: copy.menu.documentation, icon: "insert_drive_file", href: "/documentation" },
              ]}
            >
              {/* Common pages p32: two sentences on consecutive lines, no paragraph space. */}
              <p>
                {lastUpdated ? (
                  <>
                    {copy.menu.updated(lastUpdated)}
                    <br />
                  </>
                ) : null}
                <a href="https://stripe.com" className="underline underline-offset-2">
                  {copy.menu.stripe}
                </a>
                {copy.menu.and}
                <a href="https://wise.com" className="underline underline-offset-2">
                  {copy.menu.wise}
                </a>
                {copy.menu.partnersAfter}
              </p>
            </PageActionsMenu>
          </>
        }
      />

      <Sheet open={currencyOpen} onClose={() => setCurrencyOpen(false)} ariaLabel={copy.header.currencySheetLabel}>
        <div className="flex flex-col gap-2">
          {(config?.currencies ?? DONATION_CURRENCIES).map((code) => (
            <Button key={code} onClick={() => chooseCurrency(code)} variant={code === currency ? "primary" : "secondary"} fullWidth>
              <span aria-current={code === currency ? "true" : undefined}>{copy.header.currencyNames[code]}</span>
            </Button>
          ))}
        </div>
      </Sheet>

      <Container className="pt-1">
        {/* h2, not h1: NavHeader already renders the page's <h1> ("Donate"). */}
        <h2 className="text-body font-bold text-text-primary">{copy.heading}</h2>
        <p className="mt-1 text-body text-text-primary">{copy.intro}</p>

        {stats ? <ClickableStatsRow stats={stats} className="mt-5" /> : null}

        <div id="donate-amount" className={stats ? "" : "mt-5"}>
          {monthlyEnabled ? (
            /*
              Common pages p28/p30: two unfilled 40px segments sharing a 1px
              seam, rounded on their outer ends only. The selected one has a
              white stroke and text (drawn on top, so the seam is white), the
              other a muted stroke and text.
            */
            <div role="group" aria-label={copy.frequency.label} className="mt-[1.3125rem] flex">
              {(["once", "monthly"] as const).map((value, index) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => chooseFrequency(value)}
                  disabled={!interactive}
                  aria-pressed={interactive ? frequency === value : undefined}
                  className={`h-10 flex-1 border text-body ${focusRing} ${index === 0 ? "rounded-l-full" : "-ml-px rounded-r-full"} ${
                    !interactive
                      ? inertControl
                      : frequency === value
                        ? "relative z-10 cursor-pointer border-text-primary text-text-primary"
                        : "cursor-pointer border-line-strong text-text-muted hover:border-content-50"
                  }`}
                >
                  {copy.frequency[value]}
                </button>
              ))}
            </div>
          ) : null}

          <div role="group" aria-label={copy.amount.label} className={`grid grid-cols-3 gap-2 ${monthlyEnabled ? "mt-2" : stats ? "mt-[1.3125rem]" : ""}`}>
            {presets.map((major) => {
              const selected = selection?.kind === "preset" && selection.major === major;
              return (
                <button
                  key={major}
                  type="button"
                  onClick={() => choosePreset(major)}
                  disabled={!interactive}
                  aria-pressed={interactive ? selected : undefined}
                  className={`h-10 rounded-control border text-body ${focusRing} ${
                    !interactive
                      ? inertControl
                      : selected
                        ? "cursor-pointer border-inverse-surface bg-inverse-surface text-inverse-content"
                        : "cursor-pointer border-line-strong text-text-muted hover:border-content-50"
                  }`}
                >
                  {formatWhole(major, currency)}
                </button>
              );
            })}
            {editingOther ? (
              <>
                <label htmlFor="donate-other" className="sr-only">
                  {copy.amount.otherLabel}
                </label>
                <input
                  ref={otherRef}
                  id="donate-other"
                  type="text"
                  inputMode="decimal"
                  enterKeyHint="done"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  autoFocus
                  maxLength={10}
                  value={selection.text}
                  onChange={(event) => {
                    if (DECIMAL_INPUT.test(event.target.value)) setSelection({ kind: "other", text: event.target.value, editing: true });
                  }}
                  onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      validateOther();
                    }
                  }}
                  placeholder={copy.amount.other}
                  aria-describedby={notice ? "donate-notice" : undefined}
                  className={`h-10 w-full rounded-control border border-text-primary bg-transparent text-center text-body text-text-primary placeholder:text-text-muted ${focusRing}`}
                />
              </>
            ) : (
              <button
                type="button"
                onClick={startOther}
                disabled={!interactive}
                aria-pressed={interactive ? selection?.kind === "other" : undefined}
                aria-label={selection?.kind === "other" && amountMinor !== null ? `${copy.amount.otherLabel}: ${formatExact(amountMinor, currency)}` : undefined}
                className={`h-10 rounded-control border text-body ${focusRing} ${
                  !interactive
                    ? inertControl
                    : selection?.kind === "other"
                      ? "cursor-pointer border-inverse-surface bg-inverse-surface text-inverse-content"
                      : "cursor-pointer border-line-strong text-text-muted hover:border-content-50"
                }`}
              >
                {selection?.kind === "other" && amountMinor !== null ? formatExact(amountMinor, currency) : copy.amount.other}
              </button>
            )}
          </div>
        </div>

        {notice ? (
          <div id="donate-notice">
            {/* "Donations open soon" / "unavailable" describe the page itself: they stay. */}
            <DonateNotice ref={noticeRef} notice={notice} onDismiss={interactive ? () => setNotice(null) : undefined} />
          </div>
        ) : null}

        <div role="group" aria-label={copy.methods.label} aria-busy={busy !== null} className="mt-2 flex flex-col gap-2">
          {methods.map((method) => (
            <PaymentRow key={method.key} method={method.key} busy={busy} onSelect={() => void donate(method.key)} />
          ))}
        </div>
        {/* Screen readers hear the redirect; sighted visitors see it on the row. */}
        <p role="status" className="sr-only">
          {busy ? copy.methods.redirecting : ""}
        </p>

        {/* Common pages p28: rule 12px under the payment rows, "Details" 12px under it, the text 4px under that; paragraphs run on with no gap. */}
        <FullBleedSeparator className="mt-3" />

        <h3 className="mt-3 text-body font-bold text-text-primary">{copy.details.heading}</h3>
        <div className="mt-1 flex flex-col pb-2 text-body text-text-primary">
          {copy.details.paragraphs.map((paragraph) => (
            <p key={paragraph.slice(0, 40)}>{paragraph}</p>
          ))}
          <p>
            {copy.details.cancellationBefore}
            {monthlyEnabled && config?.customerPortalUrl ? (
              <a href={config.customerPortalUrl} className="underline underline-offset-2">
                {copy.details.cancellationLink}
              </a>
            ) : (
              copy.details.cancellationLink
            )}
            {copy.details.cancellationMiddle}
            <a href={`mailto:${copy.details.contactEmail}`} className="underline underline-offset-2">
              {copy.details.contactEmail}
            </a>
            {copy.details.cancellationAfter}
          </p>
          {copy.details.paragraphsAfter.map((paragraph) => (
            <p key={paragraph.slice(0, 40)}>{paragraph}</p>
          ))}
        </div>
      </Container>

      {/* Common pages p29: "Validate" above the keyboard while "Other" is being typed. */}
      {editingOther ? (
        <StickyActionBar>
          <Button variant="primary" onClick={validateOther} fullWidth className="justify-start!">
            {copy.amount.validate}
          </Button>
        </StickyActionBar>
      ) : null}
    </main>
  );
}

/** One payment row: Common pages p28 geometry (40px, 1px #484848 stroke, 4px radius, marks from x=16). */
function PaymentRow({ method, busy, onSelect }: { method: DonationMethodKey; busy: DonationMethodKey | null; onSelect: () => void }) {
  const isBusy = busy === method;
  const disabled = busy !== null;
  const { base, size, variant } = buttonClasses;
  const content = rowContent(method);
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-disabled={disabled}
      aria-label={isBusy ? `${content.name}. ${DONATE_COPY.methods.redirecting}` : content.name}
      data-method={method}
      className={`${base} ${size.control} ${variant.secondary} w-full justify-start ${content.gap} ${
        disabled ? (isBusy ? "cursor-progress" : "cursor-not-allowed opacity-50") : "cursor-pointer"
      }`}
    >
      {isBusy ? (
        <>
          <Spinner />
          <span>{DONATE_COPY.methods.redirecting}</span>
        </>
      ) : (
        <>
          {content.leading}
          {content.label ? <span>{content.label}</span> : null}
        </>
      )}
    </button>
  );
}

function rowContent(method: DonationMethodKey) {
  const methods = DONATE_COPY.methods;
  switch (method) {
    case "card":
      // Marks end at x=96, the label starts at x=100.
      return { name: methods.cardName, label: methods.card, leading: <PaymentMarks method="card" />, gap: "gap-1" };
    case "apple_pay":
      return { name: methods.applePay, label: null, leading: <PaymentMarks method="apple-pay" />, gap: "gap-2" };
    case "google_pay":
      return { name: methods.googlePay, label: null, leading: <PaymentMarks method="google-pay" />, gap: "gap-2" };
    case "paypal":
      return { name: methods.paypal, label: null, leading: <PaymentMarks method="paypal" />, gap: "gap-2" };
    case "sepa_debit":
      return { name: methods.sepa, label: methods.sepa, leading: <Icon name="account_balance" />, gap: "gap-2" };
  }
}

/** 16px, the size of the row's leading artwork; still under prefers-reduced-motion (no spin). */
function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-4 w-4 shrink-0 rounded-full border-2 border-text-muted border-t-text-primary motion-safe:animate-spin"
    />
  );
}

function buildStats(summary: DonationSummary, monthlyEnabled: boolean): StatItem[] {
  const currency = summary.currency;
  const stats = DONATE_COPY.stats;
  const items: StatItem[] = [
    {
      id: "donations",
      value: formatTotal(summary.totalDonated, currency),
      label: stats.donations,
      detail: {
        title: stats.donationsDetail.title,
        value: formatExact(Math.max(0, summary.totalDonated), currency),
        caption: stats.donationsDetail.caption(currency),
        paragraphs: stats.donationsDetail.paragraphs.map((body) => ({ body })),
      },
    },
    {
      id: "median-donation",
      value: summary.medianDonation === null ? stats.noValue : formatMedian(summary.medianDonation, currency),
      label: stats.median,
      detail: {
        title: stats.medianDetail.title,
        value: summary.medianDonation === null ? stats.noValue : formatExact(summary.medianDonation, currency),
        caption: stats.medianDetail.caption,
        paragraphs: stats.medianDetail.paragraphs.map((body) => ({ body })),
      },
    },
  ];
  // Donors stays hidden (anonymous donations, decided 2026-10-15); Monthly donors only while monthly is on.
  if (monthlyEnabled) {
    items.push({
      id: "monthly-donors",
      value: formatCount(summary.monthlyDonors),
      label: stats.monthlyDonors,
      detail: {
        title: stats.monthlyDonorsDetail.title,
        value: formatCount(summary.monthlyDonors),
        caption: stats.monthlyDonorsDetail.caption(currency),
        paragraphs: stats.monthlyDonorsDetail.paragraphs.map((body) => ({ body })),
      },
    });
  }
  return items;
}
