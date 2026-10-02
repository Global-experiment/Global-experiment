import Link from "next/link";
import { Tag } from "@/shared/ui/Tag";
import type { TreasuryTransaction } from "./presentationData";

const VISIBLE_TAGS = 2;

/**
 * History rows (figma.pdf p2): a row's own bottom stroke, label, up to two
 * tags then a "+1" badge for anything past that so the row never wraps or
 * overflows (client feedback item 14) — the hidden tags are still all
 * visible on the expense's own detail page. Expense rows navigate there
 * (client feedback item 13); donation rows have no detail view in Figma and
 * stay plain.
 */
export function TransactionList({ transactions, className = "" }: { transactions: TreasuryTransaction[]; className?: string }) {
  return (
    <ul className={className}>
      {transactions.map((transaction) => {
        const visibleTags = transaction.tags.slice(0, VISIBLE_TAGS);
        const hiddenCount = transaction.tags.length - visibleTags.length;
        const row = (
          <>
            <span className="shrink-0 whitespace-nowrap text-body font-bold text-text-primary">{transaction.label}</span>
            {visibleTags.map((tag) => (
              <Tag key={tag}>{tag}</Tag>
            ))}
            {hiddenCount > 0 ? <Tag>{`+${hiddenCount}`}</Tag> : null}
            <span className="ml-auto shrink-0 text-meta text-text-muted">{transaction.date}</span>
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
