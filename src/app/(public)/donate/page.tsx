"use client";

import { useState } from "react";
import { Button } from "@/shared/ui/Button";
import { Container } from "@/shared/ui/Container";
import { NavHeader } from "@/shared/ui/NavHeader";
import { InertActionNotice } from "@/shared/ui/InertActionNotice";

const AMOUNTS = ["$2", "$5", "$10", "$20", "$50", "Other"];
const PAYMENT_METHODS = ["Card payment via Stripe", "Apple Pay", "Google Pay", "PayPal"];

/**
 * M1 navigation scaffold. Treasury stats below are the same illustrative
 * example values the Figma source itself uses (the Documentation content
 * explicitly notes design-material figures are examples, not live data) —
 * not wired to any real Treasury data, which is M3. Amount/frequency
 * selection is real UI state; the payment methods are real buttons that
 * don't perform a payment — see
 * docs/architecture/decisions/008-route-shells.md.
 */
export default function DonatePage() {
  const [frequency, setFrequency] = useState<"once" | "monthly">("once");
  const [amount, setAmount] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);

  return (
    <main className="flex flex-1 flex-col">
      <NavHeader title="Donate" backHref="/" />
      <Container className="flex flex-col gap-6 py-6">
        <div>
          <h1 className="text-base font-bold text-text-primary">Donate to the experiment</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Thank you for considering donating to the experiment.
          </p>
        </div>

        <div className="grid grid-cols-4 gap-2 text-center">
          {[
            ["USD 91.3K", "Balance"],
            ["1.4", "Sustainability"],
            ["USD 6.4", "Med. donation"],
            ["USD 39.8K", "Expenses"],
          ].map(([value, label]) => (
            <div key={label}>
              <p className="text-sm font-bold text-text-primary">{value}</p>
              <p className="text-xs text-text-tertiary">{label}</p>
            </div>
          ))}
        </div>

        <div className="flex rounded-control border border-border-subtle">
          {(["once", "monthly"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setFrequency(value)}
              aria-pressed={frequency === value}
              className={`flex-1 rounded-control py-2 text-sm font-semibold capitalize focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
                frequency === value ? "bg-white text-black" : "text-text-secondary"
              }`}
            >
              {value}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-2">
          {AMOUNTS.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setAmount(value)}
              aria-pressed={amount === value}
              className={`rounded-control border px-4 py-3 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
                amount === value
                  ? "border-transparent bg-white text-black"
                  : "border-border-subtle text-text-primary hover:bg-white/5"
              }`}
            >
              {value}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-2">
          {PAYMENT_METHODS.map((method) => (
            <Button key={method} variant="secondary" onClick={() => setAttempted(true)} fullWidth>
              {method}
            </Button>
          ))}
        </div>

        {attempted ? <InertActionNotice /> : null}
      </Container>
    </main>
  );
}
