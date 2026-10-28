import Link from "next/link";
import type { ReactNode } from "react";
import { Highlight } from "@/shared/ui/Highlight";
import { grantChipLabel, grantListLabel, type GrantRef, type VocabularyEntry } from "../api/types";
import { focusRing } from "../ui/controls";

/** Revoked and expired access is history, not access: shown muted. */
const ended = (grant: GrantRef) => grant.status?.key === "revoked" || grant.status?.key === "expired";

/** A list cell: one grant per line — "Service / level" (Services, p16), or the service alone (Accounts, p15). */
export function grantLines(grants: readonly GrantRef[], search: string, show: "level" | "service" = "level"): ReactNode {
  return grants.map((grant) => (
    <span key={grant.id} className={`block ${ended(grant) ? "text-text-muted" : ""}`}>
      <Highlight text={show === "service" ? grant.service : grantListLabel(grant)} query={search} />
    </span>
  ));
}

const chip = `inline-flex h-8 items-center rounded-control px-2 text-body ring-1 ring-line hover:underline ${focusRing}`;

/**
 * A record's access (person record p14, Profile settings p18): one chip per
 * grant, each opening the permission. `empty` is what an empty list says.
 */
export function GrantChips({
  grants,
  empty = "No access.",
  link = true,
  format = "chip",
}: {
  grants: readonly GrantRef[];
  empty?: string;
  link?: boolean;
  /** "chip": "Service · level" (records); "list": "Service / level" (Profile settings, p18). */
  format?: "chip" | "list";
}) {
  if (grants.length === 0) return <p className="flex h-8 items-center text-body text-text-muted">{empty}</p>;
  return (
    <ul className="flex flex-wrap gap-2">
      {grants.map((grant) => {
        const label = format === "list" ? grantListLabel(grant) : grantChipLabel(grant);
        const title = grant.status ? `${label} — ${grant.status.label}` : label;
        return (
          <li key={grant.id}>
            {link ? (
              <Link href={`/admin/permissions/${grant.id}`} title={title} className={`${chip} ${ended(grant) ? "text-text-muted line-through" : ""}`}>
                {label}
              </Link>
            ) : (
              <span title={title} className={`${chip.replace("hover:underline ", "")} ${ended(grant) ? "text-text-muted line-through" : ""}`}>
                {label}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Vocabulary entries as filter options. */
export const vocabularyOptions = (entries: readonly VocabularyEntry[] | undefined) => (entries ?? []).map((entry) => ({ value: entry.key, label: entry.label }));
