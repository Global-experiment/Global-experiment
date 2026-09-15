"use client";

import { useState } from "react";

/** Real client-side copy-to-clipboard — matches the Figma copy-icon affordance, no backend involved. */
export function ContributeEmailLink({ email }: { email: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(email);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable (e.g. insecure context) — the mailto
      // link below still works, so this is a silent no-op rather than an
      // error the visitor needs to see.
    }
  }

  return (
    <div className="flex items-center gap-3">
      <a href={`mailto:${email}`} className="text-sm font-semibold text-text-primary underline">
        {email}
      </a>
      <button
        type="button"
        onClick={handleCopy}
        aria-label="Copy email address"
        className="flex h-8 w-8 items-center justify-center rounded-control text-text-tertiary hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="9" y="9" width="12" height="12" rx="2" />
          <path d="M5 15V5a2 2 0 0 1 2-2h10" />
        </svg>
      </button>
      <span role="status" className="text-xs text-text-muted">
        {copied ? "Copied" : ""}
      </span>
    </div>
  );
}
