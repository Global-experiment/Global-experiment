import Link from "next/link";
import { TransactionTags } from "./TransactionTags";
import type { TreasuryTransaction } from "./presentationData";

/**
 * History rows (figma.pdf p2): a row's own bottom stroke, the amount, as
 * many tags as fit then "+N" for the rest (TransactionTags), and the date —
 * one line that never wraps or overflows (client feedback item 14); the
 * amount and date never shrink. Every tag is still listed on the expense's
 * own detail page. Expense rows navigate there
 * (client feedback item 13); donation rows have no detail view in Figma and
 * stay plain.
 */
export function TransactionList({ transactions, className = "" }: { transactions: TreasuryTransaction[]; className?: string }) {
  return (
    <ul className={className}>
      {transactions.map((transaction) => {
        const row = (
          <>
            <span className="shrink-0 whitespace-nowrap text-body font-bold text-text-primary">{transaction.label}</span>
            <TransactionTags tags={transaction.tags} />
            <span className="shrink-0 whitespace-nowrap text-meta text-text-muted">{transaction.date}</span>
          </>
        );

        // Stroke runs through the 8px gutters, edge to edge of the content area (figma.pdf p2).
        const rowClasses = "-mx-gutter flex min-h-10 items-center gap-2 border-b border-line px-gutter";

        return (
          <li key={transaction.id}>
            {transaction.kind === "expense" ? (
              <Link
                href={`/treasury/expense/${transaction.id}`}
                className={`${rowClasses} focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary`}
              >
                {row}
              </Link>
            ) : (
              <div className={rowClasses}>{row}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
