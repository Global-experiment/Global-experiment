"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { IconButton } from "./IconButton";

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

/**
 * The responsive overlay pattern from figma.pdf: a bottom sheet on mobile
 * (p3, p16, p23 — drag handle, rounded top, full width) and a centered
 * 400px dialog on desktop (p34). Same content, same title row (close ×,
 * then the title), same 8px inner gutter either way.
 *
 * Built on the native <dialog> so focus trapping, Escape-to-close, inert
 * background and the accessible "dialog" role come from the platform.
 */
export function Sheet({ open, onClose, title, children }: SheetProps) {
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
      aria-label={title}
      onClose={onClose}
      onClick={(event) => {
        // Clicks on the backdrop land on the <dialog> itself, not a child.
        if (event.target === event.currentTarget) onClose();
      }}
      className={
        "fixed inset-x-0 top-auto bottom-0 m-0 w-full rounded-t-sheet border-t border-line bg-surface-base p-0 text-text-primary backdrop:bg-black/60 " +
        "md:inset-0 md:m-auto md:max-w-dialog md:rounded-sheet md:border"
      }
    >
      <div className="px-gutter pb-[max(0.5rem,env(safe-area-inset-bottom))] md:pb-2">
        <div aria-hidden="true" className="mx-auto mt-1 h-0.5 w-10 rounded-full bg-line md:hidden" />
        <div className="flex h-11 items-center">
          <IconButton onClick={onClose} label="Close" icon="close" className="-mx-gutter" />
          <h2 className="text-body font-bold">{title}</h2>
        </div>
        {children}
      </div>
    </dialog>
  );
}
