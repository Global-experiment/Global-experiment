"use client";

import type { Ref } from "react";
import { DONATE_COPY } from "@/shared/donate/copy";
import { Icon } from "@/shared/ui/icons";

export interface DonateNoticeContent {
  /** warning: something to fix or that failed (alert); info: a neutral confirmation (status). */
  tone: "warning" | "info";
  title: string;
  message: string;
}

/**
 * Common pages.pdf p31 "Select an amount": a #1f1f1f box (x 8–404, 52px
 * tall, 8px under the amounts and above the payment rows), 8px padding, a
 * 16px warning glyph with the 12px bold title 4px after it, the 12px message
 * 4px below, and a 16px ✕ 8px from the right edge. The other donate notices
 * (not in Figma) reuse the same box; neutral ones have no glyph.
 *
 * Announced when it appears (alert for warnings, status for info); the ✕
 * keeps a 32px hit area centred on the 16px glyph without growing the box.
 * Without `onDismiss` (a state of the page, e.g. "Donations open soon") there
 * is no ✕.
 */
export function DonateNotice({
  notice,
  onDismiss,
  ref,
}: {
  notice: DonateNoticeContent;
  onDismiss?: () => void;
  ref?: Ref<HTMLDivElement>;
}) {
  const room = onDismiss ? "pr-6" : "";
  return (
    <div
      ref={ref}
      role={notice.tone === "warning" ? "alert" : "status"}
      data-notice={notice.tone}
      className="relative mt-2 rounded-control bg-surface-raised px-2 pt-2 pb-2.5 text-text-primary"
    >
      <p
        className={`flex min-h-4 items-center gap-1 text-meta font-bold ${room}`}
      >
        {notice.tone === "warning" ? <Icon name="warning" /> : null}
        {notice.title}
      </p>
      <p className={`mt-1 text-meta ${room}`}>{notice.message}</p>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={DONATE_COPY.notices.close}
          className="absolute top-0 right-0 flex h-8 w-8 cursor-pointer items-center justify-center rounded-control focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-text-primary"
        >
          <Icon name="close" />
        </button>
      ) : null}
    </div>
  );
}
