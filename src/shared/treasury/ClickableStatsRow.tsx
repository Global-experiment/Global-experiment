"use client";

import { useState } from "react";
import { Button } from "@/shared/ui/Button";
import { Sheet } from "@/shared/ui/Sheet";
import { Icon } from "@/shared/ui/icons";
import type { TreasuryStat } from "./presentationData";

/**
 * The four Treasury/Donate stats, each opening its own detail sheet when
 * Figma shows one (client feedback items 12/23) — Balance, Sustainability
 * and Median donation do; Expenses doesn't (see presentationData.ts) and stays a
 * plain, non-interactive figure rather than opening an empty sheet.
 */
export function ClickableStatsRow({ stats, className = "" }: { stats: TreasuryStat[]; className?: string }) {
  const [openId, setOpenId] = useState<TreasuryStat["id"] | null>(null);
  const open = stats.find((stat) => stat.id === openId);

  return (
    <>
      {/* figma.pdf p2/p9: four equal columns on a 100pt pitch centered at 55.5/155.5/255/355.5 — i.e. 400px spanning 2px into each gutter. */}
      <dl className={`-mx-0.5 grid grid-cols-4 text-center ${className}`}>
        {stats.map((stat) =>
          stat.detail ? (
            <button
              key={stat.id}
              type="button"
              onClick={() => setOpenId(stat.id)}
              className="rounded-control focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary"
            >
              <dd className="text-body text-text-primary">{stat.value}</dd>
              <dt className="mt-[0.3125rem] text-meta text-text-muted">
                {stat.label}
              </dt>
            </button>
          ) : (
            <div key={stat.id}>
              <dd className="text-body text-text-primary">{stat.value}</dd>
              <dt className="mt-[0.3125rem] text-meta text-text-muted">{stat.label}</dt>
            </div>
          ),
        )}
      </dl>

      <Sheet open={open !== undefined} onClose={() => setOpenId(null)} title={open?.detail?.title ?? ""}>
        {open?.detail ? (
          <div>
            {/* figma.pdf p4: 14px value 8px under the header row, 12px caption 4px under it. */}
            <p className="mt-2 text-body text-text-primary">{open.detail.value}</p>
            <p className="mt-1 text-meta text-text-muted">{open.detail.caption}</p>
            <div className="mt-4 flex flex-col gap-paragraph">
              {open.detail.paragraphs.map((paragraph, index) => (
                <div key={index}>
                  {paragraph.heading ? (
                    <p className="text-body font-bold text-text-primary">{paragraph.heading}</p>
                  ) : null}
                  <p className={`text-body text-text-primary ${paragraph.heading ? "mt-1" : ""}`}>
                    {paragraph.body}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-col gap-2">
              <Button href="/donate" icon={<Icon name="volunteer_activism" />} fullWidth>
                Donate
              </Button>
              <Button href="/feedback" icon={<Icon name="lightbulb" />} fullWidth>
                Send feedback
              </Button>
              <Button href="/issue" icon={<Icon name="new_releases" />} fullWidth>
                Report issue
              </Button>
              <Button href="/documentation" icon={<Icon name="insert_drive_file" />} fullWidth>
                Documentation
              </Button>
            </div>
          </div>
        ) : null}
      </Sheet>
    </>
  );
}
