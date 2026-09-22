"use client";

import { useState } from "react";
import { Button } from "@/shared/ui/Button";
import { Container } from "@/shared/ui/Container";
import { FullBleedSeparator } from "@/shared/ui/FullBleedSeparator";
import { NavHeader } from "@/shared/ui/NavHeader";
import { PageActionsMenu } from "@/shared/ui/PageActionsMenu";
import { InertActionNotice } from "@/shared/ui/InertActionNotice";
import { ClickableStatsRow } from "@/shared/treasury/ClickableStatsRow";
import { TREASURY_STATS } from "@/shared/treasury/presentationData";
import { PaymentMarks, type PaymentMethodId } from "./PaymentMarks";

/**
 * Payment rows from figma.pdf p9. `marks` are the client-supplied brand
 * assets under public/assets/icons/figma/; a row whose asset has not been
 * supplied yet shows its text label only (nothing is approximated). Per
 * the client's latest note, the payment-button design itself is being
 * benchmarked/updated separately — deliberately left alone here beyond the
 * marks already wired in (client feedback item 27).
 */
const PAYMENT_METHODS: Array<{ id: PaymentMethodId; label: string; showLabel: boolean }> = [
  { id: "card", label: "Card payment via Stripe", showLabel: true },
  { id: "apple-pay", label: "Apple Pay", showLabel: false },
  { id: "google-pay", label: "Google Pay", showLabel: false },
  { id: "paypal", label: "PayPal", showLabel: false },
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
          <PageActionsMenu
            label="Page actions"
            actions={[
              { label: "Donate", icon: "volunteer_activism", href: "#donate-amount" },
              { label: "Send feedback", icon: "lightbulb", href: "/feedback" },
              { label: "Report issue", icon: "new_releases", href: "/issue" },
              { label: "Documentation", icon: "insert_drive_file", href: "/documentation" },
            ]}
          >
            The experiment uses Stripe as its payment provider and a Wise Belgian banking account, for
            the Swiss non-profit association.
          </PageActionsMenu>
        }
      />
      <Container className="pt-1">
        {/* h2, not h1: NavHeader already renders the page's <h1> ("Donate"). */}
        <h2 className="text-body font-bold text-text-primary">Donate to the experiment</h2>
        <p className="mt-1 text-body text-text-primary">Thank you for considering donating to the experiment.</p>

        <ClickableStatsRow stats={TREASURY_STATS} className="mt-5" />

        {/*
          Compact per client feedback item 25 ("the big toggle... doesn't
          have the right feel"): no exact replacement control is visible in
          the client's currently available Figma reference (figma.pdf and
          design.pdf both still show the original oversized pill) — see the
          final report. This keeps the same interaction and copy at a
          visibly smaller, less dominant size pending that reference.
        */}
        <div
          id="donate-amount"
          role="group"
          aria-label="Frequency"
          className="mt-6 inline-flex h-8 gap-1 rounded-control border border-line p-0.5"
        >
          {(["once", "monthly"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setFrequency(value)}
              aria-pressed={frequency === value}
              className={`rounded-[3px] px-2 text-meta capitalize ${focusRing} ${
                frequency === value ? "bg-inverse-surface text-inverse-content" : "text-text-muted"
              }`}
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
                  : "border-line-strong text-text-primary hover:border-content-50"
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
              className={`h-10 rounded-control border border-line-strong text-body text-text-primary hover:border-content-50 ${focusRing}`}
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
              icon={<PaymentMarks method={method.id} />}
              className="gap-2! pl-[7px]!"
              fullWidth
            >
              {method.showLabel ? method.label : <span className="sr-only">{method.label}</span>}
            </Button>
          ))}
        </div>

        {attempted ? <InertActionNotice /> : null}

        <FullBleedSeparator className="mt-4" />

        <div className="mt-4 flex flex-col gap-3 pb-2 text-body text-text-primary">
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
