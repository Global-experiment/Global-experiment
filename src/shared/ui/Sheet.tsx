"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { IconButton } from "./IconButton";

interface SheetProps {
  open: boolean;
  onClose: () => void;
  /**
   * Visible "✕ Title" header row — only stat/detail sheets show this in
   * Figma (Balance, Sustainability, Median donation). Overflow/action menus
   * (page actions, Donate menu, Feedback/Issue type pickers) show no
   * header at all: no title text and no close icon, just the drag handle
   * on mobile — dismissed by backdrop click, Escape, or picking an action
   * (client feedback item 9). Omit this prop for that case.
   */
  title?: string;
  /** Accessible name when no visible title is shown. */
  ariaLabel?: string;
  children: ReactNode;
}

/**
 * The responsive overlay pattern from Figma: a bottom sheet on mobile
 * (p3, p16, p23 — drag handle, square corners, no border) and a centered
 * bordered/rounded 400px dialog on desktop (p34) — mobile and desktop are
 * deliberately styled differently here (client feedback item 10).
 *
 * Built on the native <dialog> so focus trapping, Escape-to-close, inert
 * background and the accessible "dialog" role come from the platform.
 */
export function Sheet({ open, onClose, title, ariaLabel, children }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label={title ?? ariaLabel}
      onClose={onClose}
      onClick={(event) => {
        // Clicks on the backdrop land on the <dialog> itself, not a child.
        if (event.target === event.currentTarget) onClose();
      }}
      className={
        "fixed inset-x-0 top-auto bottom-0 m-0 w-full bg-surface-base p-0 text-text-primary backdrop:bg-black/60 " +
        "md:inset-0 md:m-auto md:max-w-dialog md:rounded-sheet md:border md:border-line"
      }
    >
      <div className="px-gutter pb-[max(0.5rem,env(safe-area-inset-bottom))] md:pb-2">
        <div aria-hidden="true" className="mx-auto mt-1 h-0.5 w-10 rounded-full bg-line md:hidden" />
        {title ? (
          <div className="flex h-11 items-center">
            <IconButton onClick={onClose} label="Close" icon="close" className="-mx-gutter" />
            <h2 className="text-body font-bold">{title}</h2>
          </div>
        ) : (
          <div className="pt-3" />
        )}
        {children}
      </div>
    </dialog>
  );
}
