"use client";

import { useState } from "react";
import { Button } from "@/shared/ui/Button";
import { Container } from "@/shared/ui/Container";
import { NavHeader } from "@/shared/ui/NavHeader";
import { PageActionsMenu } from "@/shared/ui/PageActionsMenu";
import { StickyActionBar } from "@/shared/ui/StickyActionBar";
import { ClickableStatsRow } from "@/shared/treasury/ClickableStatsRow";
import { INITIAL_HISTORY_FILTER, filterHistory, nextHistoryFilter } from "@/shared/treasury/historyFilter";
import { TransactionList } from "@/shared/treasury/TransactionList";
import {
  TREASURY_HISTORY_TOTAL,
  TREASURY_LAST_UPDATED,
  TREASURY_STATS,
  TREASURY_TRANSACTIONS,
} from "@/shared/treasury/presentationData";
import { shareUrl } from "@/shared/ui/ShareButton";

/**
 * M1 navigation scaffold in the figma.pdf p2 layout: stats (three of the
 * four open a real detail sheet — client feedback item 12), filter pills,
 * 40px history rows with their own bottom stroke (expense rows navigate to
 * a detail page — item 13), bottom Donate CTA, overflow sheet (p3). The tab
 * toggle is real UI state; no data exists behind either tab yet. See
 * docs/architecture/decisions/008-route-shells.md.
 *
 * Default shows every transaction, newest first; Expenses/Donations are
 * selectable filters — the active one clears back to all, the other one
 * switches across (see historyFilter).
 */
export default function TreasuryPage() {
  const [tab, setTab] = useState(INITIAL_HISTORY_FILTER);
  const visible = filterHistory(TREASURY_TRANSACTIONS, tab);

  return (
    <main className="flex flex-1 flex-col">
      <NavHeader
        title="Treasury"
        backHref="/"
        actions={
          <PageActionsMenu
            label="Page actions"
            actions={[
              { label: "Share page", icon: "share", onClick: () => void shareUrl("/treasury", "Treasury") },
              { label: "Donate", icon: "volunteer_activism", href: "/donate" },
              { label: "Send feedback", icon: "lightbulb", href: "/feedback" },
              { label: "Report issue", icon: "new_releases", href: "/issue" },
              { label: "Documentation", icon: "insert_drive_file", href: "/documentation" },
            ]}
          >
            {/* figma.pdf p3, verbatim. */}
            <p>This page was last updated at {TREASURY_LAST_UPDATED}.</p>
            <p>
              It automatically fetches data from Wise bank account. Some information are held private for
              privacy purposes, but all transactions either donations or expenses, are publicly available.
            </p>
            <p>Info on fees.</p>
          </PageActionsMenu>
        }
      />
      <Container className="pt-2">
        <ClickableStatsRow stats={TREASURY_STATS} />

        <div role="group" aria-label="Filter history" className="mt-4 flex gap-2">
          {(["expenses", "donations"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab((current) => nextHistoryFilter(current, value))}
              aria-pressed={tab === value}
              className={`h-8 rounded-full border px-[calc(var(--spacing-gutter)-1px)] text-meta capitalize focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary ${
                tab === value ? "border-inverse-surface bg-inverse-surface text-inverse-content" : "border-line text-text-primary"
              }`}
            >
              {value}
            </button>
          ))}
        </div>

        {/* figma.pdf p2: 14px bold heading, 12px muted total on the same baseline, rows 12px below. */}
        <h2 className="mt-[0.9375rem] text-body text-text-primary">
          <span className="font-bold">History</span>{" "}
          <span className="text-meta text-text-muted">{TREASURY_HISTORY_TOTAL}</span>
        </h2>
        <TransactionList transactions={visible} className="mt-[0.6875rem]" />
      </Container>

      <StickyActionBar>
        <Button variant="primary" href="/donate" icon="volunteer_activism" fullWidth>
          Donate
        </Button>
      </StickyActionBar>
    </main>
  );
}
