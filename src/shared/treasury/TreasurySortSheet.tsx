"use client";

import { Icon } from "@/shared/ui/icons";
import { SHEET_BLEED, Sheet } from "@/shared/ui/Sheet";
import { TREASURY_COPY } from "./copy";
import type { TreasurySort } from "./treasuryParams";

const copy = TREASURY_COPY.sort;

/**
 * "Sort by" (Common pages p13): 40px full-bleed rows with a bottom rule;
 * the active row shows its direction ("Latest first ↓") on the right.
 * Choosing another row sorts by it, largest / latest first; choosing the
 * active row again flips its direction. Only Date and Amount exist for
 * Treasury entries (Figma's other rows belong to other lists).
 */
export function TreasurySortSheet({ open, onClose, sort, onSort }: { open: boolean; onClose: () => void; sort: TreasurySort; onSort: (sort: TreasurySort) => void }) {
  const rows = [
    { field: "date", label: copy.date },
    { field: "amount", label: copy.amount },
  ] as const;
  const choose = (field: "date" | "amount") => {
    const next: TreasurySort = sort.startsWith(field) ? (sort.endsWith("_desc") ? `${field}_asc` : `${field}_desc`) : `${field}_desc`;
    onSort(next);
    onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} title={copy.title}>
      <ul>
        {rows.map(({ field, label }) => {
          const active = sort.startsWith(field);
          return (
            <li key={field}>
              <button
                type="button"
                onClick={() => choose(field)}
                aria-pressed={active}
                className={`${SHEET_BLEED} flex min-h-10 w-[calc(100%+2*var(--sheet-pad))] cursor-pointer items-center justify-between border-b border-line text-left text-body text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-text-primary`}
              >
                <span>{label}</span>
                {active ? (
                  <span className="flex items-center gap-1 text-meta text-text-muted">
                    {copy.directions[sort]}
                    <Icon name="arrow_downward" className={sort.endsWith("_asc") ? "rotate-180" : ""} />
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}
