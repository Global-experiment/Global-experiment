"use client";

import { useRef, useState } from "react";
import { AdminIcon, NotionMark } from "../ui/adminIcons";
import { AdminButton, Popover } from "../ui/controls";

export type NotionImportState = "idle" | "running" | "done";

/**
 * ONE control with Figma's three appearances (figma.pdf p40: Notion mark →
 * idle, sync → running, check_circle → done). The import itself isn't
 * built: mapping the legacy Notion sources (Contributors, Contractors) to
 * People/Organizations is an open client decision, so this never runs or
 * reports an import — it explains what's pending instead. The `state` prop
 * is the seam the real import will drive.
 */
export function NotionImportControl({ state = "idle" }: { state?: NotionImportState }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);

  return (
    <div className="relative">
      <AdminButton
        ref={trigger}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-state={state}
        onClick={() => setOpen((value) => !value)}
        leading={state === "running" ? <AdminIcon name="sync" /> : state === "done" ? <AdminIcon name="check_circle" /> : <NotionMark />}
      >
        Notion import
      </AdminButton>
      <Popover open={open} onClose={() => setOpen(false)} triggerRef={trigger} label="Notion import" className="top-[calc(100%+8px)] right-0 w-[360px] p-3">
        <p className="font-bold">Notion import isn&rsquo;t available yet</p>
        <p className="mt-2 text-text-muted">
          Nothing has been imported. How the legacy Notion databases (Contributors, Contractors) map to People and
          Organizations is still awaiting a client decision.
        </p>
        <p className="mt-2 text-text-muted">
          When it ships, the import will only add records — no AI, duplicates kept and marked DUPLICATE, never merged
          silently.
        </p>
      </Popover>
    </div>
  );
}
