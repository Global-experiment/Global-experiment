"use client";

import { useState } from "react";
import { Button } from "@/shared/ui/Button";
import { Container } from "@/shared/ui/Container";
import { NavHeader } from "@/shared/ui/NavHeader";
import { PageActionsMenu } from "@/shared/ui/PageActionsMenu";
import { StickyActionBar } from "@/shared/ui/StickyActionBar";
import { Icon } from "@/shared/ui/icons";
import { ClickableStatsRow } from "@/shared/treasury/ClickableStatsRow";
import { TransactionList } from "@/shared/treasury/TransactionList";
import { TREASURY_STATS, TREASURY_TRANSACTIONS } from "@/shared/treasury/presentationData";

/**
 * M1 navigation scaffold in the figma.pdf p2 layout: stats (three of the
 * four open a real detail sheet — client feedback item 12), filter pills,
 * 40px history rows with their own bottom stroke (expense rows navigate to
 * a detail page — item 13), bottom Donate CTA, overflow sheet (p3). The tab
 * toggle is real UI state; no data exists behind either tab yet. See
 * docs/architecture/decisions/008-route-shells.md.
 */
export default function TreasuryPage() {
  const [tab, setTab] = useState<"expenses" | "donations">("expenses");
  const visible = TREASURY_TRANSACTIONS.filter((t) => (tab === "expenses" ? t.kind === "expense" : t.kind === "income"));

  return (
    <main className="flex flex-1 flex-col pb-16">
      <NavHeader
        title="Treasury"
        backHref="/"
        actions={
          <PageActionsMenu
            label="Page actions"
            actions={[
              { label: "Donate", icon: "volunteer_activism", href: "/donate" },
              { label: "Send feedback", icon: "lightbulb", href: "/feedback" },
              { label: "Report issue", icon: "new_releases", href: "/issue" },
              { label: "Documentation", icon: "insert_drive_file", href: "/documentation" },
            ]}
          />
        }
      />
      <Container className="pt-1">
        <ClickableStatsRow stats={TREASURY_STATS} />

        <div role="group" aria-label="Filter history" className="mt-4 flex gap-2">
          {(["expenses", "donations"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              aria-pressed={tab === value}
              className={`h-8 rounded-full border px-2 text-meta capitalize focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary ${
                tab === value ? "border-inverse-surface bg-inverse-surface text-inverse-content" : "border-line text-text-primary"
              }`}
            >
              {value}
            </button>
          ))}
        </div>

        <h2 className="mt-4 text-body font-bold text-text-primary">History</h2>
        <TransactionList transactions={visible} />
      </Container>

      <StickyActionBar>
        <Button variant="primary" href="/donate" icon={<Icon name="volunteer_activism" />} fullWidth>
          Donate
        </Button>
      </StickyActionBar>
    </main>
  );
}
