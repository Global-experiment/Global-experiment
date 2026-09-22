import { notFound } from "next/navigation";
import { Button } from "@/shared/ui/Button";
import { Container } from "@/shared/ui/Container";
import { NavHeader } from "@/shared/ui/NavHeader";
import { StickyActionBar } from "@/shared/ui/StickyActionBar";
import { Tag } from "@/shared/ui/Tag";
import { Icon } from "@/shared/ui/icons";
import { FeedbackIssueActions } from "@/shared/ui/FeedbackIssueActions";
import { TREASURY_TRANSACTIONS } from "@/shared/treasury/presentationData";

interface ExpenseDetailPageProps {
  params: Promise<{ id: string }>;
}

/**
 * The expense-detail screen from figma.pdf p6–p8: a normal full-page route
 * (not a modal, on mobile or desktop), back arrow, all tags shown in full
 * (the list row's "+1" badge only hides them there — client feedback item
 * 14), amount, description when Figma actually gave one for this example,
 * Send feedback/Report issue actions. Reads only the existing Treasury
 * presentation fixture — no real financial API (client feedback item 13).
 */
export default async function ExpenseDetailPage({ params }: ExpenseDetailPageProps) {
  const { id } = await params;
  const transaction = TREASURY_TRANSACTIONS.find((t) => t.id === id && t.kind === "expense");

  if (!transaction?.detail) {
    notFound();
  }

  return (
    <main className="flex flex-1 flex-col pb-16">
      <NavHeader title="Expense" backHref="/treasury" />
      <Container className="pt-1">
        <p className="text-meta text-text-muted">{transaction.detail.paidLabel}</p>
        {transaction.tags.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {transaction.tags.map((tag) => (
              <Tag key={tag}>{tag}</Tag>
            ))}
          </div>
        ) : null}
        <p className="mt-4 text-body font-bold text-text-primary">{transaction.detail.amount}</p>
        {transaction.detail.description ? (
          <p className="mt-1 text-body text-text-primary">{transaction.detail.description}</p>
        ) : null}
        <FeedbackIssueActions className="mt-5" />
      </Container>

      <StickyActionBar>
        <Button variant="primary" href="/donate" icon={<Icon name="volunteer_activism" />} fullWidth>
          Donate
        </Button>
      </StickyActionBar>
    </main>
  );
}
