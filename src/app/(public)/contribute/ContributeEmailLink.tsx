"use client";

import { useState } from "react";
import { IconButton } from "@/shared/ui/IconButton";
import { Icon } from "@/shared/ui/icons";

/**
 * 16px underlined mailto link followed by the Material `content_copy`
 * control; the `check_circle` glyph from figma.pdf p31 is shown as the
 * copied confirmation. Real client-side clipboard use, no backend.
 */
export function ContributeEmailLink({ email }: { email: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(email);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable (e.g. insecure context) — the mailto
      // link still works, so this is a silent no-op rather than an
      // error the visitor needs to see.
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
      <IconButton onClick={handleCopy} label="Copy email address" icon="content_copy" className="-my-2.5 -ml-1" />
      <span role="status" className="flex items-center">
        {copied ? (
          <>
            <Icon name="check_circle" size={20} />
            <span className="sr-only">Email address copied</span>
          </>
        ) : null}
      </span>
    </div>
  );
}
