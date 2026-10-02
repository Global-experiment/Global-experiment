"use client";

import { useEffect, useRef, type PointerEvent, type ReactNode } from "react";
import { IconButton } from "./IconButton";
import { recentVelocity, sheetDragOffset, shouldDismissSheet, type DragSample } from "./sheetDrag";

/** Same breakpoint as the `md:` desktop dialog styles and the slide-up CSS. */
const MOBILE_QUERY = "(width < 48rem)";

interface DragState {
  pointerId: number;
  startY: number;
  samples: DragSample[];
}

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
 *
 * On mobile the handle/header strip can also be dragged down to close
 * (distance or flick, else it snaps back — see sheetDrag.ts). Only that
 * strip takes the gesture (`touch-action: none`), so scrolling the content
 * is untouched; desktop has no drag. Snap-back/close reuse the CSS
 * transition, which prefers-reduced-motion already zeroes.
 */
export function Sheet({ open, onClose, title, ariaLabel, headerVariant = "detail", children }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const drag = useRef<DragState | null>(null);
  const pressedBackdrop = useRef(false);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      // Drop any offset left by a drag-to-close so the next open slides up from scratch.
      dialog.style.removeProperty("translate");
      dialog.style.removeProperty("transition");
      dialog.showModal();
      // showModal() focuses the first control (✕); when the sheet opens
      // without a click (the type pickers open on page load) browsers then
      // draw a keyboard focus ring Figma doesn't have. Focusing the dialog
      // keeps focus inside it (Tab still reaches ✕ first) without the ring.
      dialog.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  function onDragStart(event: PointerEvent<HTMLDivElement>) {
    const dialog = ref.current;
    if (!dialog || !event.isPrimary || event.button !== 0) return;
    if (!window.matchMedia(MOBILE_QUERY).matches) return;
    // The ✕ (and anything else interactive in the header) keeps its own tap.
    if ((event.target as Element).closest("button, a, input, textarea, select")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { pointerId: event.pointerId, startY: event.clientY, samples: [{ y: event.clientY, t: event.timeStamp }] };
    dialog.style.transition = "none";
  }

  function onDragMove(event: PointerEvent<HTMLDivElement>) {
    const state = drag.current;
    const dialog = ref.current;
    if (!state || !dialog || event.pointerId !== state.pointerId) return;
    state.samples.push({ y: event.clientY, t: event.timeStamp });
    if (state.samples.length > 20) state.samples.shift();
    dialog.style.translate = `0 ${sheetDragOffset(event.clientY - state.startY)}px`;
  }

  function onDragEnd(event: PointerEvent<HTMLDivElement>, cancelled = false) {
    const state = drag.current;
    const dialog = ref.current;
    if (!state || !dialog || event.pointerId !== state.pointerId) return;
    drag.current = null;
    const offset = sheetDragOffset(event.clientY - state.startY);
    // Hand back to the stylesheet transition for both outcomes.
    dialog.style.removeProperty("transition");
    if (
      !cancelled &&
      shouldDismissSheet({ offset, velocity: recentVelocity(state.samples), height: dialog.getBoundingClientRect().height })
    ) {
      dialog.style.translate = "0 100%";
      onClose();
    } else {
      dialog.style.removeProperty("translate");
    }
  }

  return (
    <dialog
      ref={ref}
      tabIndex={-1}
      aria-label={title ?? ariaLabel}
      onClose={onClose}
      onPointerDown={(event) => {
        pressedBackdrop.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        // Clicks on the backdrop land on the <dialog> itself, not a child.
        // The press must start there too: a drag (or text selection) that
        // begins inside the sheet and is released over the backdrop isn't
        // a backdrop click.
        if (event.target === event.currentTarget && pressedBackdrop.current) onClose();
        pressedBackdrop.current = false;
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
        {/* Drag strip: handle + header (mobile only; inert on desktop). The -mx/px keeps it full width. */}
        <div
          data-sheet-drag-handle
          onPointerDown={onDragStart}
          onPointerMove={onDragMove}
          onPointerUp={(event) => onDragEnd(event)}
          onPointerCancel={(event) => onDragEnd(event, true)}
          className="-mx-gutter touch-none px-gutter select-none md:mx-0 md:touch-auto md:px-0 md:select-auto"
        >
          <div aria-hidden="true" className="mx-auto mt-1 h-0.5 w-4 rounded-full bg-line md:hidden" />
          {title ? (
            <div className={`${headerVariant === "picker" ? "mt-px" : "mt-1"} flex min-h-10 items-center md:-mt-px`}>
              <IconButton onClick={onClose} label="Close" icon="close" className="-ml-gutter" />
              <h2 className="min-w-0 py-1 break-words text-body font-bold">{title}</h2>
            </div>
          ) : (
            <div className="pt-2" />
          )}
        </div>
        {children}
      </div>
    </dialog>
  );
}
