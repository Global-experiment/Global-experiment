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
  /**
   * Figma places the "✕ Title" row 3px higher on the Feedback/Issue type
   * pickers (p23/p27: ✕ frame at y=19) than on the stat detail sheets
   * (p4–p6: y=22).
   */
  headerVariant?: "detail" | "picker";
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
export function Sheet({ open, onClose, title, ariaLabel, headerVariant = "detail", children }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      // showModal() focuses the first control (✕); when the sheet opens
      // without a click (the type pickers open on page load) browsers then
      // draw a keyboard focus ring Figma doesn't have. Focusing the dialog
      // keeps focus inside it (Tab still reaches ✕ first) without the ring.
      dialog.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      tabIndex={-1}
      aria-label={title ?? ariaLabel}
      onClose={onClose}
      onClick={(event) => {
        // Clicks on the backdrop land on the <dialog> itself, not a child.
        if (event.target === event.currentTarget) onClose();
      }}
      className={
        "sheet fixed inset-x-0 top-auto bottom-0 m-0 w-full bg-surface-base p-0 text-text-primary outline-none backdrop:bg-black/60 " +
        "md:inset-0 md:m-auto md:max-w-dialog md:rounded-sheet md:border md:border-line"
      }
    >
      {/*
        figma.pdf p3/p4/p12/p16/p18 (mobile): 16×2 handle 4px from the top;
        a titled sheet's 40px "✕ Title" row starts 4px under the handle
        (glyph frame at y=22); an untitled sheet's content starts 8px under
        it; 16px below the last row.
      */}
      <div className="px-gutter pb-[max(1rem,env(safe-area-inset-bottom))] md:px-[calc(var(--spacing-gutter)-1px)] md:pb-[calc(var(--spacing-gutter)-1px)]">
        <div aria-hidden="true" className="mx-auto mt-1 h-0.5 w-4 rounded-full bg-line md:hidden" />
        {title ? (
          <div className={`${headerVariant === "picker" ? "mt-px" : "mt-1"} flex min-h-10 items-center md:-mt-px`}>
            <IconButton onClick={onClose} label="Close" icon="close" className="-ml-gutter" />
            <h2 className="min-w-0 py-1 break-words text-body font-bold">{title}</h2>
          </div>
        ) : (
          <div className="pt-2" />
        )}
        {children}
      </div>
    </dialog>
  );
}
