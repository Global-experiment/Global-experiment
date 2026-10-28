"use client";

import { useId, useState } from "react";
import type { OneTimeLink } from "../api/types";
import { formatPanelDate } from "../ui/RecordForm";
import { AdminButton } from "../ui/controls";

/**
 * A one-time link, shown once to the Rootadmin who made it (no email is
 * sent yet): they copy it and pass it on privately. Only its hash is
 * stored, so it can't be shown again — a new link replaces it.
 */
export function OneTimeLinkBox({ link, name }: { link: OneTimeLink; name: string }) {
  const id = useId();
  const [copied, setCopied] = useState<"yes" | "failed" | null>(null);
  const what = link.purpose === "invite" ? "invitation link" : "password reset link";

  async function copy() {
    try {
      await navigator.clipboard.writeText(link.link);
      setCopied("yes");
    } catch {
      setCopied("failed");
    }
  }

  return (
    <div data-one-time-link className="flex flex-col gap-2 rounded-control p-2 ring-1 ring-line">
      <label htmlFor={id} className="text-body font-bold">
        {name}&rsquo;s {what}
      </label>
      <div className="flex gap-2">
        <input
          id={id}
          readOnly
          value={link.link}
          onFocus={(event) => event.currentTarget.select()}
          spellCheck={false}
          className="h-8 min-w-0 flex-1 rounded-control bg-transparent px-2 font-mono text-meta text-text-primary ring-1 ring-line outline-none focus-visible:ring-text-primary"
        />
        <AdminButton icon="content_copy" onClick={() => void copy()}>
          {copied === "yes" ? "Copied" : "Copy"}
        </AdminButton>
      </div>
      <p role="status" className="text-meta text-text-muted">
        {copied === "failed" ? "Couldn’t copy: select the link and copy it. " : ""}
        Shown only now. It works once, until {formatPanelDate(link.expiresAt)}; send it privately. A new link cancels this one.
      </p>
    </div>
  );
}
