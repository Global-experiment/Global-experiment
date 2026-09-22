"use client";

import { useEffect, useRef, useState } from "react";
import { IconButton } from "@/shared/ui/IconButton";

const CONFIRMATION_MS = 3000;

/**
 * 16px underlined mailto link followed by the Material Sharp
 * `content_copy` control. On a successful copy, the icon swaps to
 * `check_circle` for exactly 3 seconds and then reverts (client feedback
 * item 30) — same 20px icon box throughout, so nothing shifts. Real
 * client-side clipboard use, no backend. A failed copy leaves the icon as
 * `content_copy`: never shows a false success.
 */
export function ContributeEmailLink({ email }: { email: string }) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timeoutRef.current), []);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(email);
      setCopied(true);
      clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setCopied(false), CONFIRMATION_MS);
    } catch {
      // Clipboard API unavailable (e.g. insecure context) — the mailto
      // link still works, so this is a silent no-op rather than a false
      // success or an error the visitor needs to see.
    }
  }

  return (
    <div className="flex items-center gap-1">
      <a
        href={`mailto:${email}`}
        className="text-lead break-all text-text-primary underline underline-offset-2"
      >
        {email}
      </a>
      <IconButton
        onClick={handleCopy}
        label={copied ? "Copied" : "Copy email address"}
        icon={copied ? "check_circle" : "content_copy"}
        className="-my-2.5 -ml-1"
      />
      <span role="status" className="sr-only">
        {copied ? "Email address copied" : ""}
      </span>
    </div>
  );
}
