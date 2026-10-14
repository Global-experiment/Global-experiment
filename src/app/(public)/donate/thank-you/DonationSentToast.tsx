"use client";

import { useEffect, useState } from "react";

const VISIBLE_MS = 4000;

/**
 * Common pages.pdf p33 "Donation sent": a 34px #1f1f1f pill, bold 14px text,
 * 12px side padding, centred near the bottom (the same toast as the admin's).
 * Announced politely; hides itself after a few seconds.
 */
export function DonationSentToast({ message }: { message: string }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), VISIBLE_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[max(1.5rem,env(safe-area-inset-bottom))] z-50 ml-(--scrollbar-offset) flex justify-center"
    >
      {visible ? (
        <p data-toast className="flex h-[34px] items-center rounded-full bg-surface-raised px-3 text-body font-bold whitespace-nowrap text-text-primary">
          {message}
        </p>
      ) : null}
    </div>
  );
}
