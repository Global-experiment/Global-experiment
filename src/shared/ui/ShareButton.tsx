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
 * The Material `share` control from the Figma headers and article rows.
 * Uses the Web Share API where the browser offers it (mobile), otherwise
 * copies the link. Purely client-side — nothing is sent anywhere.
 */
export function ShareButton({ url, title, className }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const absolute = new URL(url, window.location.origin).toString();
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ url: absolute, title });
        return;
      }
      await navigator.clipboard.writeText(absolute);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // User dismissed the share sheet, or clipboard access was refused —
      // nothing to recover from.
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
