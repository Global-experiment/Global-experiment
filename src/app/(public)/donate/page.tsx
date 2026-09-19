"use client";

import { useState } from "react";
import Image from "next/image";
import { Button } from "@/shared/ui/Button";
import { Container } from "@/shared/ui/Container";
import { NavHeader } from "@/shared/ui/NavHeader";
import { PageActionsMenu } from "@/shared/ui/PageActionsMenu";
import { StatsRow } from "@/shared/ui/StatsRow";
import { InertActionNotice } from "@/shared/ui/InertActionNotice";

const AMOUNTS = ["$2", "$5", "$10", "$20", "$50"];
/**
 * Payment rows from figma.pdf p9. `marks` are the client-supplied brand
 * assets under public/assets/icons/figma/; a row whose asset has not been
 * supplied yet shows its text label only (nothing is approximated).
 */
const PAYMENT_METHODS: Array<{ label: string; marks: string[] }> = [
  { label: "Card payment via Stripe", marks: ["payment-visa.svg"] },
  { label: "Apple Pay", marks: [] },
  { label: "Google Pay", marks: [] },
  { label: "PayPal", marks: [] },
];

/**
 * NOT LIVE DATA. Same illustrative example values the Figma source itself
 * uses (the Documentation content explicitly notes design-material
 * figures are examples) — real Treasury data is M3. Never wire this route
 * to a real data source without renaming/removing this constant.
 */
const DEVELOPMENT_FIXTURE_STATS = [
  ["USD 91.3K", "Balance"],
  ["1.4", "Sustainability"],
  ["USD 6.4", "Med. donation"],
  ["USD 39.8K", "Expenses"],
] as const;

/**
 * A 24×16 white card chip (the Visa tile in the design) holding the
 * supplied mark. The file is displayed untouched — the chip supplies the
 * light background a dark mark needs on the black page. Decorative: the
 * row's text label names the method.
 */
function PaymentMark({ file }: { file: string }) {
  return (
    <span className="flex h-4 w-6 items-center justify-center rounded-[3px] bg-white">
      <Image src={`/assets/icons/figma/${file}`} alt="" width={22} height={22} unoptimized />
    </span>
  );
}

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";

/**
 * M1 navigation scaffold in the figma.pdf p9–p11 layout: heading, stats,
 * white-outlined Once/Monthly segmented control, 3×2 amount picker (with
 * "Other" turning into a field), 40px payment rows. Selection is real UI
 * state; the payment rows perform no payment (Stripe is M3). See
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
            title="Page actions"
            actions={[
              { label: "Send feedback", icon: "lightbulb", href: "/feedback" },
              { label: "Report issue", icon: "new_releases", href: "/issue" },
              { label: "Documentation", icon: "insert_drive_file", href: "/documentation" },
            ]}
          />
        }
      />
      <Container className="pt-1">
        {/* h2, not h1: NavHeader already renders the page's <h1> ("Donate"). */}
        <h2 className="text-body font-bold text-text-primary">Donate to the experiment</h2>
        <p className="mt-1 text-body text-text-primary">Thank you for considering donating to the experiment.</p>

        <StatsRow stats={DEVELOPMENT_FIXTURE_STATS} className="mt-5" />

        <div role="group" aria-label="Frequency" className="mt-6 flex h-10 rounded-full border border-white p-[3px]">
          {(["once", "monthly"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setFrequency(value)}
              aria-pressed={frequency === value}
              className={`flex-1 rounded-full border text-body capitalize ${focusRing} ${
                frequency === value ? "border-white text-text-primary" : "border-transparent text-text-muted"
              }`}
            >
              {value}
            </button>
          ))}
        </div>

        <div role="group" aria-label="Amount" className="mt-2 grid grid-cols-3 gap-2">
          {AMOUNTS.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setAmount(value)}
              aria-pressed={amount === value}
              className={`h-10 rounded-control border text-body ${focusRing} ${
                amount === value
                  ? "border-white bg-white text-black"
                  : "border-line-strong text-text-primary hover:bg-white/5"
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
                type="number"
                inputMode="decimal"
                min={1}
                autoFocus
                value={otherAmount}
                onChange={(event) => setOtherAmount(event.target.value)}
                placeholder="Other"
                className={`h-10 w-full rounded-control border border-white bg-transparent text-center text-body text-text-primary placeholder:text-text-muted ${focusRing}`}
              />
            </>
          ) : (
            <button
              type="button"
              onClick={() => setAmount("other")}
              aria-pressed={false}
              className={`h-10 rounded-control border border-line-strong text-body text-text-primary hover:bg-white/5 ${focusRing}`}
            >
              Other
            </button>
          )}
        </div>

        <div className="mt-2 flex flex-col gap-2">
          {PAYMENT_METHODS.map((method) => (
            <Button
              key={method.label}
              onClick={() => setAttempted(true)}
              icon={
                method.marks.length > 0 ? (
                  <span className="flex items-center gap-1">
                    {method.marks.map((file) => (
                      <PaymentMark key={file} file={file} />
                    ))}
                  </span>
                ) : undefined
              }
              className="gap-2! pl-2!"
              fullWidth
            >
              {method.label}
            </Button>
          ))}
        </div>

        {attempted ? <InertActionNotice /> : null}
      </Container>
    </main>
  );
}
