"use client";

import { useState } from "react";
import { Button } from "@/shared/ui/Button";
import { Container } from "@/shared/ui/Container";
import { NavHeader } from "@/shared/ui/NavHeader";
import { StickyActionBar } from "@/shared/ui/StickyActionBar";
import { DonateIcon } from "@/shared/ui/icons";

/**
 * NOT LIVE DATA. Same illustrative example values the Figma source itself
 * uses — real Treasury synchronization/reconciliation is M3. Never wire
 * this route to a real data source without renaming/removing this
 * constant; its name is deliberately unambiguous.
 */
const DEVELOPMENT_FIXTURE_STATS: Array<[string, string]> = [
  ["USD 91.3K", "Balance"],
  ["1.4", "Sustainability"],
  ["USD 6.4", "Med. donation"],
  ["USD 39.8K", "Expenses"],
];

/** NOT LIVE DATA — see DEVELOPMENT_FIXTURE_STATS above. */
const DEVELOPMENT_FIXTURE_HISTORY = [
  { label: "+ EUR 8", tag: null, date: "Aug 12 09:14" },
  { label: "- CHF 70", tag: "Unqualified", date: "Aug 11 16:42" },
  { label: "+ INR 500", tag: null, date: "Aug 10 21:08" },
  { label: "- USD 60", tag: "Treasury management", date: "Aug 09 13:25" },
];

/**
 * M1 navigation scaffold — see docs/architecture/decisions/008-route-shells.md.
 * The tab toggle is real UI state; no data exists behind either tab yet.
 */
export default function TreasuryPage() {
  const [tab, setTab] = useState<"expenses" | "donations">("expenses");

  return (
    <main className="flex flex-1 flex-col pb-24">
      <NavHeader title="Treasury" backHref="/" />
      <Container className="flex flex-col gap-6 py-6">
        <div className="grid grid-cols-4 gap-2 text-center">
          {DEVELOPMENT_FIXTURE_STATS.map(([value, label]) => (
            <div key={label}>
              <p className="text-sm font-bold text-text-primary">{value}</p>
              <p className="text-xs text-text-tertiary">{label}</p>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          {(["expenses", "donations"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              aria-pressed={tab === value}
              className={`rounded-full border px-4 py-2 text-sm font-semibold capitalize focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
                tab === value ? "border-white bg-white text-black" : "border-border-subtle text-text-secondary"
              }`}
            >
              {value}
            </button>
          ))}
        </div>

        <div>
          <p className="mb-2 text-sm font-bold text-text-primary">History</p>
          <div>
            {DEVELOPMENT_FIXTURE_HISTORY.map((entry, index) => (
              <div
                key={index}
                className="flex items-center justify-between gap-3 border-b border-border-faint py-3"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-text-primary">{entry.label}</span>
                  {entry.tag ? (
                    <span className="rounded-control border border-border-subtle px-2 py-0.5 text-xs text-text-tertiary">
                      {entry.tag}
                    </span>
                  ) : null}
                </div>
                <span className="text-xs text-text-muted">{entry.date}</span>
              </div>
            ))}
          </div>
        </div>
      </Container>

      <StickyActionBar>
        <Button variant="primary" href="/donate" icon={<DonateIcon />} fullWidth>
          Donate
        </Button>
      </StickyActionBar>
    </main>
  );
}
