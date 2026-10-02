"use client";

import { useState } from "react";
import { IconButton } from "./IconButton";

interface ShareButtonProps {
  /** Absolute or root-relative URL to share; resolved against the current origin at click time. */
  url: string;
  title?: string;
  className?: string;
}

/**
 * Shares `url` with the Web Share API where the browser offers it (mobile),
 * otherwise copies it. Resolves to "copied" when it fell back to the
 * clipboard, so callers can confirm that. Purely client-side.
 */
export async function shareUrl(url: string, title?: string): Promise<"shared" | "copied" | "dismissed"> {
  const absolute = new URL(url, window.location.origin).toString();
  try {
    if (typeof navigator.share === "function") {
      await navigator.share({ url: absolute, title });
      return "shared";
    }
    await navigator.clipboard.writeText(absolute);
    return "copied";
  } catch {
    // User dismissed the share sheet, or clipboard access was refused.
    return "dismissed";
  }
}

/** The `share` control from the Figma headers and article rows. */
export function ShareButton({ url, title, className }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);

  async function share() {
    if ((await shareUrl(url, title)) === "copied") {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <>
      <IconButton onClick={share} label="Share" icon="share" className={className} />
      <span role="status" className="sr-only">
        {copied ? "Link copied" : ""}
      </span>
    </>
  );
}
