"use client";

import { useEffect, useRef, type PointerEvent, type ReactNode } from "react";
import { IconButton } from "./IconButton";
import {
  contentGestureOwner,
  recentVelocity,
  sheetDragOffset,
  shouldDismissSheet,
  type DragSample,
} from "./sheetDrag";

/** Same breakpoint as the `md:` desktop dialog styles and the slide-up CSS. */
const MOBILE_QUERY = "(width < 48rem)";

/**
 * Full-bleed rows inside a Sheet (Figma's edge-to-edge row rules, e.g. the
 * Feedback/Issue type pickers): cancel exactly the sheet's own side padding,
 * which differs between the mobile sheet (8px) and the bordered desktop
 * dialog (7px inside its 1px border). Both read the same `--sheet-pad`, so a
 * row can never be wider than the sheet — the 1px overshoot that gave the
 * desktop pickers a horizontal scrollbar (Review #3 item 2).
 */
export const SHEET_BLEED = "-mx-[var(--sheet-pad)] px-[var(--sheet-pad)]";

interface Gesture {
  /** Pointer id for mouse/pen; "touch" for the touch path. */
  id: number | "touch";
  startX: number;
  startY: number;
  samples: DragSample[];
  /** Started on the handle/header strip: always the sheet's gesture. */
  fromHandle: boolean;
  /** Committed to dragging the sheet (vs. scrolling its content). */
  dragging: boolean;
}

interface SheetProps {
  open: boolean;
  onClose: () => void;
  /**
   * Visible "✕ Title" header row — only stat/detail sheets show this in
   * Figma (Balance, Sustainability, Median donation, Expenses). Overflow/
   * action menus (page actions, Donate menu, Feedback/Issue type pickers)
   * show no header at all: no title text and no close icon, just the drag
   * handle on mobile — dismissed by backdrop click, Escape, dragging down,
   * or picking an action (client feedback item 9). Omit this prop for that.
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
 * Drag down to close (mobile only; desktop never drags):
 * - Touch: a swipe that starts on the handle/header always drags; one that
 *   starts on the content drags only when the content is scrolled to the
 *   top and the finger moves mainly down — otherwise the content scrolls
 *   natively (see `contentGestureOwner`). Touch listeners are attached
 *   non-passively so a committed drag can `preventDefault()` — that is what
 *   stops the browser from scrolling/pull-to-refreshing the page instead
 *   (Review #3 item 3); globals.css also locks page scroll while a sheet is
 *   open.
 * - Mouse/pen: the handle/header strip, with pointer capture.
 * Release past the distance/velocity threshold closes; otherwise it snaps
 * back. Both reuse the CSS transition, which prefers-reduced-motion zeroes.
 */
export function Sheet({ open, onClose, title, ariaLabel, headerVariant = "detail", children }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const pressedBackdrop = useRef(false);
  const suppressClickUntil = useRef(0);
  const onCloseRef = useRef(onClose);
  /** The gesture engine, exposed to the React pointer handlers on the handle strip. */
  const pointerApi = useRef<{
    begin: (id: number, x: number, y: number, t: number, fromHandle: boolean) => void;
    move: (x: number, y: number, t: number) => boolean;
    end: (y: number, cancelled: boolean) => void;
  } | null>(null);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

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

  // Gesture engine shared by the touch and pointer paths.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const isMobile = () => window.matchMedia(MOBILE_QUERY).matches;

    const begin = (id: Gesture["id"], x: number, y: number, t: number, fromHandle: boolean) => {
      gesture.current = { id, startX: x, startY: y, samples: [{ y, t }], fromHandle, dragging: false };
    };

    /** Returns true while the sheet owns the gesture (caller then prevents the default). */
    const move = (x: number, y: number, t: number): boolean => {
      const state = gesture.current;
      if (!state) return false;
      const dy = y - state.startY;
      if (!state.dragging) {
        const owner = state.fromHandle ? "drag" : contentGestureOwner({ dx: x - state.startX, dy, scrollTop: dialog.scrollTop });
        if (owner === "undecided") return false;
        if (owner === "scroll") {
          gesture.current = null;
          return false;
        }
        state.dragging = true;
        dialog.style.transition = "none";
      }
      state.samples.push({ y, t });
      if (state.samples.length > 20) state.samples.shift();
      dialog.style.translate = `0 ${sheetDragOffset(dy)}px`;
      return true;
    };

    const end = (y: number, cancelled: boolean) => {
      const state = gesture.current;
      gesture.current = null;
      if (!state?.dragging) return;
      // The tap that ends a drag must not also click a row underneath.
      suppressClickUntil.current = performance.now() + 400;
      dialog.style.removeProperty("transition");
      const offset = sheetDragOffset(y - state.startY);
      const height = dialog.getBoundingClientRect().height;
      if (!cancelled && shouldDismissSheet({ offset, velocity: recentVelocity(state.samples), height })) {
        dialog.style.translate = "0 100%";
        onCloseRef.current();
      } else {
        dialog.style.removeProperty("translate");
      }
    };

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1 || !isMobile()) {
        gesture.current = null;
        return;
      }
      const target = event.target as Element;
      // Text fields keep their own touch behaviour (caret, selection).
      if (target.closest("input:not([type='checkbox']), textarea, select")) return;
      const touch = event.touches[0]!;
      const onHandle = target.closest("[data-sheet-drag-handle]") !== null && !target.closest("button, a");
      begin("touch", touch.clientX, touch.clientY, event.timeStamp, onHandle);
    };
    const onTouchMove = (event: TouchEvent) => {
      if (gesture.current?.id !== "touch") return;
      const touch = event.touches[0];
      if (!touch) return;
      if (move(touch.clientX, touch.clientY, event.timeStamp) && event.cancelable) event.preventDefault();
    };
    const onTouchEnd = (event: TouchEvent) => {
      if (gesture.current?.id !== "touch") return;
      const touch = event.changedTouches[0];
      end(touch?.clientY ?? gesture.current.startY, false);
    };
    const onTouchCancel = () => {
      if (gesture.current?.id === "touch") end(gesture.current.startY, true);
    };
    const onClickCapture = (event: MouseEvent) => {
      if (performance.now() < suppressClickUntil.current) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    dialog.addEventListener("touchstart", onTouchStart, { passive: true });
    dialog.addEventListener("touchmove", onTouchMove, { passive: false });
    dialog.addEventListener("touchend", onTouchEnd);
    dialog.addEventListener("touchcancel", onTouchCancel);
    dialog.addEventListener("click", onClickCapture, true);

    pointerApi.current = { begin, move, end };
    return () => {
      dialog.removeEventListener("touchstart", onTouchStart);
      dialog.removeEventListener("touchmove", onTouchMove);
      dialog.removeEventListener("touchend", onTouchEnd);
      dialog.removeEventListener("touchcancel", onTouchCancel);
      dialog.removeEventListener("click", onClickCapture, true);
      pointerApi.current = null;
    };
  }, []);

  // Mouse/pen: the handle strip only (touch has its own path above).
  function onHandlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "touch" || !event.isPrimary || event.button !== 0) return;
    if (!window.matchMedia(MOBILE_QUERY).matches) return;
    // The ✕ (and anything else interactive in the header) keeps its own click.
    if ((event.target as Element).closest("button, a, input, textarea, select")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerApi.current?.begin(event.pointerId, event.clientX, event.clientY, event.timeStamp, true);
  }
  function onHandlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (gesture.current?.id !== event.pointerId) return;
    pointerApi.current?.move(event.clientX, event.clientY, event.timeStamp);
  }
  function onHandlePointerEnd(event: PointerEvent<HTMLDivElement>, cancelled: boolean) {
    if (gesture.current?.id !== event.pointerId) return;
    pointerApi.current?.end(event.clientY, cancelled);
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
      // Never taller than the visible viewport (dvh follows mobile browser
      // toolbars): long content — e.g. Sustainability on a short phone —
      // scrolls inside the sheet instead of running off the top of the screen.
      className={
        "sheet fixed inset-x-0 top-auto bottom-0 m-0 max-h-[calc(100dvh-2rem)] w-full overflow-y-auto bg-surface-base p-0 text-text-primary outline-none backdrop:bg-black/60 " +
        "md:inset-0 md:m-auto md:max-w-dialog md:rounded-sheet md:border md:border-line"
      }
    >
      {/*
        figma.pdf p3/p4/p12/p16/p18 (mobile): 16×2 handle 4px from the top;
        a titled sheet's 40px "✕ Title" row starts 4px under the handle
        (glyph frame at y=22); an untitled sheet's content starts 8px under
        it; 16px below the last row. --sheet-pad: 8px gutter on mobile, 7px
        inside the desktop dialog's 1px border (see SHEET_BLEED).
      */}
      <div className="px-(--sheet-pad) pb-[max(1rem,env(safe-area-inset-bottom))] [--sheet-pad:var(--spacing-gutter)] md:pb-[calc(var(--spacing-gutter)-1px)] md:[--sheet-pad:calc(var(--spacing-gutter)-1px)]">
        {/* Drag strip: handle + header (mobile only; inert on desktop), full sheet width. */}
        <div
          data-sheet-drag-handle
          onPointerDown={onHandlePointerDown}
          onPointerMove={onHandlePointerMove}
          onPointerUp={(event) => onHandlePointerEnd(event, false)}
          onPointerCancel={(event) => onHandlePointerEnd(event, true)}
          className={`${SHEET_BLEED} touch-none select-none md:touch-auto md:select-auto`}
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
