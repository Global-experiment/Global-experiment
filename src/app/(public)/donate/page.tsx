"use client";

import { useState } from "react";
import { Button } from "@/shared/ui/Button";
import { Container } from "@/shared/ui/Container";
import { FullBleedSeparator } from "@/shared/ui/FullBleedSeparator";
import { NavHeader } from "@/shared/ui/NavHeader";
import { PageActionsMenu } from "@/shared/ui/PageActionsMenu";
import { ShareButton } from "@/shared/ui/ShareButton";
import { InertActionNotice } from "@/shared/ui/InertActionNotice";
import { ClickableStatsRow } from "@/shared/treasury/ClickableStatsRow";
import { TREASURY_LAST_UPDATED, TREASURY_STATS } from "@/shared/treasury/presentationData";
import { PaymentMarks, type PaymentMethodId } from "./PaymentMarks";

/**
 * Payment rows from figma.pdf p9 — labels and casing match the exported
 * text exactly ("Apple pay", "Google pay", "Proceed with Paypal"). Figma
 * spaces the mark and label 8px on the Card and Apple Pay rows but 4px on
 * Google Pay and PayPal; reproduced per row rather than normalized.
 */
const PAYMENT_METHODS: Array<{ id: PaymentMethodId; label: string; tightGap?: boolean }> = [
  { id: "card", label: "Card payment via Stripe" },
  { id: "apple-pay", label: "Apple pay" },
  { id: "google-pay", label: "Google pay", tightGap: true },
  { id: "paypal", label: "Proceed with Paypal", tightGap: true },
];

// Only digits and at most one decimal point/comma — never rely on the
// browser's native number-input spinner (client feedback item 26).
const DECIMAL_INPUT = /^[0-9]*[.,]?[0-9]*$/;

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary";

/**
 * M1 navigation scaffold in the figma.pdf p9–p11 layout: heading, stats
 * (same clickable detail sheets as Treasury — item 23), Once/Monthly
 * segmented control, 3×2 amount picker (with "Other" turning into a
 * spinner-free text field — item 26), payment rows, and the full legal
 * copy from p9 (item 28). Selection is real UI state; the payment rows
 * perform no payment (Stripe is M3). See
 * docs/architecture/decisions/008-route-shells.md.
 */
export default function DonatePage() {
  const [frequency, setFrequency] = useState<"once" | "monthly">("once");
  const [amount, setAmount] = useState<string | null>(null);
  const [otherAmount, setOtherAmount] = useState("");
  const [attempted, setAttempted] = useState(false);

  return (
    <main className="flex flex-1 flex-col pb-6">
      <NavHeader
        title="Donate"
        backHref="/"
        actions={
          <>
          {/* figma.pdf p9: share before the overflow menu. */}
          <ShareButton url="/donate" title="Donate" />
          <PageActionsMenu
            label="Page actions"
            actions={[
              { label: "Donate", icon: "volunteer_activism", href: "#donate-amount" },
              { label: "Send feedback", icon: "lightbulb", href: "/feedback" },
              { label: "Report issue", icon: "new_releases", href: "/issue" },
              { label: "Documentation", icon: "insert_drive_file", href: "/documentation" },
            ]}
          >
            {/* figma.pdf p12 ("as it payment provider" in Figma corrected to "its"). */}
            <p>This page was last updated at {TREASURY_LAST_UPDATED}.</p>
            <p>
              The experiment uses Stripe as its payment provider and a Wise Belgian banking account, for
              the Swiss non-profit association.
            </p>
          </PageActionsMenu>
          </>
        }
      />
      <Container className="pt-1">
        {/* h2, not h1: NavHeader already renders the page's <h1> ("Donate"). */}
        <h2 className="text-body font-bold text-text-primary">Donate to the experiment</h2>
        <p className="mt-1 text-body text-text-primary">Thank you for considering donating to the experiment.</p>

        <ClickableStatsRow stats={TREASURY_STATS} className="mt-5" />

        {/*
          figma.pdf p9–p11: two unfilled 40px segments sharing a 1px seam,
          rounded on their outer ends only. The selected one has a white
          stroke and text (drawn on top, so the seam is white), the other a
          muted stroke and text.
        */}
        <div id="donate-amount" role="group" aria-label="Frequency" className="mt-6 flex">
          {(["once", "monthly"] as const).map((value, index) => (
            <button
              key={value}
              type="button"
              onClick={() => setFrequency(value)}
              aria-pressed={frequency === value}
              className={`h-10 flex-1 border text-body capitalize ${focusRing} ${
                index === 0 ? "rounded-l-full" : "-ml-px rounded-r-full"
              } ${frequency === value ? "relative z-10 border-text-primary text-text-primary" : "border-line-strong text-text-muted"}`}
            >
              {value}
            </button>
          ))}
        </div>

        <div role="group" aria-label="Amount" className="mt-2 grid grid-cols-3 gap-2">
          {["$2", "$5", "$10", "$20", "$50"].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setAmount(value)}
              aria-pressed={amount === value}
              className={`h-10 rounded-control border text-body ${focusRing} ${
                amount === value
                  ? "border-inverse-surface bg-inverse-surface text-inverse-content"
                  : "border-line-strong text-text-muted hover:border-content-50"
              }`}
            >
              {value}
            </button>
          ))}
          {amount === "other" ? (
            <>
              <label htmlFor="donate-other" className="sr-only">
                Other amount
              </label>
              <input
                id="donate-other"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                autoFocus
                value={otherAmount}
                onChange={(event) => {
                  if (DECIMAL_INPUT.test(event.target.value)) setOtherAmount(event.target.value);
                }}
                placeholder="Other"
                className={`h-10 w-full rounded-control border border-text-primary bg-transparent text-center text-body text-text-primary placeholder:text-text-muted ${focusRing}`}
              />
            </>
          ) : (
            <button
              type="button"
              onClick={() => setAmount("other")}
              aria-pressed={false}
              className={`h-10 rounded-control border border-line-strong text-body text-text-muted hover:border-content-50 ${focusRing}`}
            >
              Other
            </button>
          )}
        </div>

        <div className="mt-2 flex flex-col gap-2">
          {PAYMENT_METHODS.map((method) => (
            <Button
              key={method.id}
              onClick={() => setAttempted(true)}
              leading={<PaymentMarks method={method.id} />}
              className={method.tightGap ? "gap-1!" : ""}
              fullWidth
            >
              {method.label}
            </Button>
          ))}
        </div>

        {attempted ? <InertActionNotice /> : null}

        {/* figma.pdf p9: rule 12px under the payment rows; legal copy 10px under the rule, paragraphs run on with no gap. */}
        <FullBleedSeparator className="mt-3" />

        <div className="mt-2.5 flex flex-col pb-2 text-body text-text-primary">
          <p>
            The Global Experiment is a Swiss non-profit association. Donations support the development,
            operation and public-interest activities of the initiative. Donations do not purchase goods,
            services or ownership rights, and do not grant donors control over the organisation or its
            decisions.
          </p>
          <p>
            Payments are securely processed by Stripe. Stripe may offer card payments, Apple Pay, Google
            Pay, PayPal and other payment methods depending on the donor&rsquo;s country, currency, device
            and eligibility. Payment details are processed by Stripe and are not stored directly by the
            Global Experiment. Stripe&rsquo;s fees and any applicable currency-conversion costs are
            deducted before funds are paid out to the association&rsquo;s Wise account.
          </p>
          <p>
            One-time donations are charged once. Monthly donations are charged automatically using the
            payment method authorised at checkout until the donor cancels them. The amount, currency and
            frequency are shown before confirmation. A payment may fail, be delayed, be reversed or be
            disputed in accordance with the applicable payment method&rsquo;s rules.
          </p>
          <p>
            Monthly donations can be cancelled at any time through the available subscription-management
            link or by contacting{" "}
            <a href="mailto:donations@globalexperiment.org" className="underline underline-offset-2">
              donations@globalexperiment.org
            </a>
            . Cancellation normally prevents future charges but does not automatically reverse payments
            that have already been completed. Refund requests are assessed in accordance with the
            association&rsquo;s refund policy and applicable law.
          </p>
          <p>
            Receipts are issued for successful payments where an email address has been provided. A
            donation receipt does not necessarily constitute a tax certificate. Tax deductibility depends
            on the donor&rsquo;s country and applicable law; donors should consult the relevant tax
            authority or adviser.
          </p>
          <p>
            The Global Experiment does not sell or trade donor information. Personal data is processed
            only for purposes such as payment processing, donation records, receipts, fraud prevention,
            accounting, legal compliance and donor support. Stripe, Wise and other service providers may
            process relevant information on behalf of the association, including in countries outside
            Switzerland or the donor&rsquo;s country.
            {/*
              Figma links this sentence to a "Privacy Policy" destination
              that doesn't exist as a route in this application yet — see
              the final report (client feedback item 28). The copy is kept
              verbatim; only the link is not yet wired to anything.
            */}{" "}
            Further information, including data-retention periods and data-subject rights, is available
            in the Privacy Policy.
          </p>
          <p>
            Donations are recorded in the association&rsquo;s financial records and may be included in
            aggregated or anonymised public reports. A donor&rsquo;s name, email address and donation
            details are not publicly displayed by default.
          </p>
          <p>
            By confirming a donation, the donor acknowledges this information and agrees to the processing
            of personal data described in the Privacy Policy and, where applicable, the Donation and
            Refund Policy.
          </p>
        </div>
      </Container>
    </main>
  );
}
