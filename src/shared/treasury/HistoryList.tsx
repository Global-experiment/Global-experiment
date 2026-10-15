import Link from "next/link";
import type { PublicTreasuryEntry } from "@/shared/config/publicApi";
import { TREASURY_COPY } from "./copy";
import { formatEntryTime, formatSignedAmount } from "./format";
import { TransactionTags } from "./TransactionTags";

/** The public page of an entry: expenses, and donations with their refunds and disputes. */
export const entryHref = (entry: Pick<PublicTreasuryEntry, "type" | "number">) =>
  entry.type === "expense" ? `/treasury/expense/${entry.number}` : `/treasury/donation/${entry.number}`;

/** A row's tags (p11): "Test" for a sandbox donation, "Not qualified yet", then the expense types. */
export function entryTags(entry: PublicTreasuryEntry): string[] {
  return [
    ...(entry.test ? [TREASURY_COPY.history.test] : []),
    ...(entry.qualified ? [] : [TREASURY_COPY.history.notQualified]),
    ...entry.expenseTypes.map((type) => type.label),
  ];
}

/**
 * History rows (Common pages p11): the signed amount, as many tags as fit
 * then "+N" (TransactionTags), the time — one 40px line with its own bottom
 * stroke through the gutters. Every row opens its entry's page (expense
 * p22, anonymous donation p26). The sign is visual; screen readers hear the
 * kind ("Expense USD 50").
 */
export function HistoryList({ entries, now, className = "" }: { entries: PublicTreasuryEntry[]; now: Date; className?: string }) {
  return (
    <ul className={className}>
      {entries.map((entry) => (
        <li key={entry.number}>
          <Link
            href={entryHref(entry)}
            className="-mx-gutter flex min-h-10 items-center gap-2 border-b border-line px-gutter focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-text-primary"
          >
            <span className="shrink-0 whitespace-nowrap text-body font-bold text-text-primary">
              <span className="sr-only">{TREASURY_COPY.history.kinds[entry.type]} </span>
              <span aria-hidden="true" data-amount>
                {formatSignedAmount(entry.amount, entry.currency)}
              </span>
              <span className="sr-only">{formatSignedAmount(entry.amount, entry.currency).slice(2)}</span>
            </span>
            <TransactionTags tags={entryTags(entry)} />
            <span className="ml-auto shrink-0 whitespace-nowrap text-meta text-text-muted">{formatEntryTime(entry, now)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
