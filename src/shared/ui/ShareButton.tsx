"use client";

import { useEffect, useRef, useState } from "react";
import { IconButton } from "./IconButton";
import { showToast } from "./toast";

interface ShareButtonProps {
  /** Absolute or root-relative URL to share; resolved against the current origin at click time. Defaults to the current page. */
  url?: string;
  title?: string;
  className?: string;
}

/** Shown after every copy (client feedback 2026-10-19). */
export const LINK_COPIED = "Link copied to clipboard";
const CONFIRMATION_MS = 3000;

/** Desktop = a precise pointer that can hover; touch devices keep the native share sheet. */
function isDesktop(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Clipboard refused (insecure context, permission): never a false success.
    return false;
  }
}

/**
 * Shares `url` (client feedback 2026-10-19): on desktop it copies the link
 * and shows the "Link copied to clipboard" toast; on mobile it opens the
 * native share sheet (unchanged), and copies instead where there is none.
 * Resolves to what happened, so a caller can confirm a copy (check icon).
 */
export async function shareUrl(url: string, title?: string): Promise<"shared" | "copied" | "dismissed"> {
  const absolute = new URL(url, window.location.origin).toString();
  if (!isDesktop() && typeof navigator.share === "function") {
    try {
      await navigator.share({ url: absolute, title });
      return "shared";
    } catch {
      // The visitor dismissed the share sheet.
      return "dismissed";
    }
  }
  if (await copy(absolute)) {
    showToast(LINK_COPIED);
    return "copied";
  }
  return "dismissed";
}

/** The `share` control of every public header: after a copy its icon is a check for 3 seconds, like the contribute email copy. */
export function ShareButton({ url, title, className }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timeoutRef.current), []);

  async function share() {
    const target = url ?? window.location.pathname + window.location.search;
    if ((await shareUrl(target, title ?? document.title)) === "copied") {
      setCopied(true);
      clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setCopied(false), CONFIRMATION_MS);
    }
  }

  return <IconButton onClick={share} label={copied ? "Link copied" : "Share"} icon={copied ? "check_circle" : "share"} className={className} />;
}
