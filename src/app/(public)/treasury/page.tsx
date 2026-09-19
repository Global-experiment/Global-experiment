"use client";

import { useState } from "react";
import { Button } from "@/shared/ui/Button";
import { Container } from "@/shared/ui/Container";
import { NavHeader } from "@/shared/ui/NavHeader";
import { PageActionsMenu } from "@/shared/ui/PageActionsMenu";
import { StatsRow } from "@/shared/ui/StatsRow";
import { StickyActionBar } from "@/shared/ui/StickyActionBar";
import { Tag } from "@/shared/ui/Tag";
import { Icon } from "@/shared/ui/icons";

/**
 * NOT LIVE DATA. Same illustrative example values the Figma source itself
 * uses — real Treasury synchronization/reconciliation is M3. Never wire
 * this route to a real data source without renaming/removing this
 * constant; its name is deliberately unambiguous.
 */
const DEVELOPMENT_FIXTURE_STATS = [
  ["USD 91.3K", "Balance"],
  ["1.4", "Sustainability"],
  ["USD 6.4", "Med. donation"],
  ["USD 39.8K", "Expenses"],
] as const;

/** NOT LIVE DATA — see DEVELOPMENT_FIXTURE_STATS above. */
const DEVELOPMENT_FIXTURE_HISTORY = [
  { label: "+ EUR 8", tags: [], date: "Aug 12 09:14" },
  { label: "- CHF 70", tags: ["Unqualified"], date: "Aug 11 16:42" },
  { label: "+ INR 500", tags: [], date: "Aug 10 21:08" },
  { label: "- USD 60", tags: ["Banking", "Treasury management"], date: "Aug 09 13:25" },
];

/**
 * M1 navigation scaffold in the figma.pdf p2 layout: stats, filter pills,
 * 40px history rows with 1px dividers, bottom Donate CTA, overflow sheet
 * (p3). The tab toggle is real UI state; no data exists behind either tab
 * yet. See docs/architecture/decisions/008-route-shells.md.
 */
export default function TreasuryPage() {
  const [tab, setTab] = useState<"expenses" | "donations">("expenses");

  return (
    <main className="flex flex-1 flex-col pb-16">
      <NavHeader
        title="Treasury"
        backHref="/"
        actions={
          <PageActionsMenu
            title="Page actions"
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
        <StatsRow stats={DEVELOPMENT_FIXTURE_STATS} />

        <div role="group" aria-label="Filter history" className="mt-4 flex gap-2">
          {(["expenses", "donations"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              aria-pressed={tab === value}
              className={`h-8 rounded-full border px-2 text-meta capitalize focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
                tab === value ? "border-white bg-white text-black" : "border-line text-text-primary"
              }`}
            >
              {value}
            </button>
          ))}
        </div>

        <h2 className="mt-4 text-body font-bold text-text-primary">History</h2>
        <ul className="mt-3">
          {DEVELOPMENT_FIXTURE_HISTORY.map((entry) => (
            <li key={entry.label + entry.date} className="flex h-10 items-center gap-2 border-b border-line">
              <span className="text-body font-bold text-text-primary">{entry.label}</span>
              {entry.tags.map((tag) => (
                <Tag key={tag}>{tag}</Tag>
              ))}
              <span className="ml-auto text-meta text-text-muted">{entry.date}</span>
            </li>
          ))}
        </ul>
      </Container>

      <StickyActionBar>
        <Button variant="primary" href="/donate" icon={<Icon name="volunteer_activism" />} fullWidth>
          Donate
        </Button>
      </StickyActionBar>
    </main>
  );
}
