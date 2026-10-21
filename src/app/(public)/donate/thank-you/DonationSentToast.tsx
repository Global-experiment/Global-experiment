"use client";

import { useEffect } from "react";
import { showToast } from "@/shared/ui/toast";

/**
 * Common pages.pdf p34 "Donation sent", shown once on arrival through the
 * public site's one toast layer (ToastHost), so it floats above the bottom
 * bar and any open sheet like every other toast (client review 2026-10-21).
 */
export function DonationSentToast({ message }: { message: string }) {
  useEffect(() => {
    showToast(message);
  }, [message]);
  return null;
}
