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
      <dl className={`grid grid-cols-4 gap-2 text-center ${className}`}>
        {stats.map((stat) =>
          stat.detail ? (
            <button
              key={stat.id}
              type="button"
              onClick={() => setOpenId(stat.id)}
              className="rounded-control focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary"
            >
              <dd className="text-body text-text-primary">{stat.value}</dd>
              <dt className="mt-1 text-meta text-text-muted underline decoration-line underline-offset-2">
                {stat.label}
              </dt>
            </button>
          ) : (
            <div key={stat.id}>
              <dd className="text-body text-text-primary">{stat.value}</dd>
              <dt className="mt-1 text-meta text-text-muted">{stat.label}</dt>
            </div>
          ),
        )}
      </dl>

      <Sheet open={open !== undefined} onClose={() => setOpenId(null)} title={open?.detail?.title ?? ""}>
        {open?.detail ? (
          <div className="pb-4">
            <p className="text-lead text-text-primary">{open.detail.value}</p>
            <p className="text-meta text-text-muted">{open.detail.caption}</p>
            <div className="mt-4 flex flex-col gap-4">
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
