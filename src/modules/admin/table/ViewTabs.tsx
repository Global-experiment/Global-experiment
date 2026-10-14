"use client";

import { useRef, useState } from "react";
import { AdminIcon } from "../ui/adminIcons";
import { focusRing, Popover } from "../ui/controls";

export interface ViewTab {
  id: string;
  label: string;
}

/**
 * Figma's saved-view tabs (admin-desktop.pdf p2): the current view white
 * with the filled glyph, the others muted with the table glyph, 16px
 * apart; past `maxVisible` the rest collapse into a muted "+N" that opens
 * them in a popover. Only "All" exists until the client defines the views
 * (Sourcing, Discussions, Contributors, Collaborators…); each new view is
 * one more entry here, with its filters behind `onSelect`.
 */
export function ViewTabs({
  views,
  current,
  onSelect,
  maxVisible = 5,
}: {
  views: readonly ViewTab[];
  current: string;
  onSelect?: (id: string) => void;
  maxVisible?: number;
}) {
  const [open, setOpen] = useState(false);
  const more = useRef<HTMLButtonElement>(null);
  const visible = views.slice(0, maxVisible);
  const overflow = views.slice(maxVisible);

  const tab = (view: ViewTab) => {
    const active = view.id === current;
    return (
      <button
        type="button"
        aria-pressed={active}
        onClick={() => {
          setOpen(false);
          onSelect?.(view.id);
        }}
        className={`flex cursor-pointer items-center gap-1 rounded-control ${active ? "text-text-primary" : "text-text-muted hover:text-text-primary"} ${focusRing}`}
      >
        <AdminIcon name={active ? "view_all" : "view_column"} />
        {view.label}
      </button>
    );
  };

  return (
    <div role="group" aria-label="Views" className="flex shrink-0 items-center gap-4 text-body whitespace-nowrap">
      {visible.map((view) => (
        <span key={view.id}>{tab(view)}</span>
      ))}
      {overflow.length > 0 ? (
        <span className="relative">
          <button
            ref={more}
            type="button"
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-label={`${overflow.length} more views`}
            onClick={() => setOpen((value) => !value)}
            className={`cursor-pointer rounded-control text-text-muted hover:text-text-primary ${focusRing}`}
          >
            +{overflow.length}
          </button>
          <Popover open={open} onClose={() => setOpen(false)} triggerRef={more} label="More views" className="top-[calc(100%+8px)] left-0 flex min-w-40 flex-col gap-2 p-2">
            {overflow.map((view) => (
              <span key={view.id}>{tab(view)}</span>
            ))}
          </Popover>
        </span>
      ) : null}
    </div>
  );
}
