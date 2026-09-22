/**
 * NOT LIVE DATA. Same illustrative example values (and, for the two
 * expense entries with a `description`, the same literal copy) the Figma
 * source itself uses — real Treasury synchronization/reconciliation is M3.
 * Shared by the Treasury and Donate route shells so both routes present
 * one consistent set of example transactions instead of two independently
 * hand-typed lists. Never wire either route to a real data source without
 * renaming/removing this module; the name is deliberately unambiguous.
 */

export interface TreasuryStat {
  id: "balance" | "sustainability" | "median-donation" | "expenses";
  value: string;
  label: string;
  /**
   * Detail-sheet copy. Figma only shows a detail view for three of the
   * four stats (Balance, Sustainability, Median donation) — Expenses has
   * none, so it's left undetailed rather than inventing copy for it (see
   * docs/architecture/design-fidelity.md).
   */
  detail?: {
    title: string;
    value: string;
    caption: string;
    paragraphs: Array<{ heading?: string; body: string }>;
  };
}

export const TREASURY_STATS: TreasuryStat[] = [
  {
    id: "balance",
    value: "USD 91.3K",
    label: "Balance",
    detail: {
      title: "Balance",
      value: "$ 91.301,07",
      caption: "Treasury balance",
      paragraphs: [
        { body: "The balance is United States Dollars 91.301,07 and was last updated at 2:07 PM." },
        {
          body: "The balance represents the current funds available in the experiment's Wise account. All funds are publicly disclosed, with no hidden reserves.",
        },
      ],
    },
  },
  {
    id: "sustainability",
    value: "1.4",
    label: "Sustainability",
    detail: {
      title: "Sustainability",
      value: "1.4",
      caption: "Sustainability score",
      paragraphs: [
        {
          body: "The sustainability score estimates how long the experiment could continue using its current balance, based on its average monthly expenses over the past six months. A score of 0 indicates no financial reserve, while a score of 10 indicates approximately three years of available funding.",
        },
        {
          heading: "How it is calculated",
          body: "It calculates the average monthly expenses from the past six months. It divides the current balance by that monthly average to estimate how many months the experiment could continue without receiving new donations. It converts that estimate into a score from 0 to 10. The logarithmic scale gives more detail to shorter runways, while gradually reducing the difference between longer ones. A runway of 36 months or more receives the maximum score of 10.",
        },
      ],
    },
  },
  {
    id: "median-donation",
    value: "USD 6.4",
    label: "Med. donation",
    detail: {
      title: "Median donation",
      value: "$ 6.4",
      caption: "Median donation",
      paragraphs: [
        {
          body: "The median donation is the middle donation amount when all donations are ordered from smallest to largest. Half of the donations are lower than this amount, and half are higher.",
        },
      ],
    },
  },
  { id: "expenses", value: "USD 39.8K", label: "Expenses" },
];

export interface TreasuryTransaction {
  id: string;
  label: string;
  kind: "income" | "expense";
  /** Every tag; list rows show the first two plus a "+1"-style badge for the rest. */
  tags: string[];
  date: string;
  /** Only expenses navigate to a detail page (client feedback item 13) — Figma shows no detail view for donations. */
  detail?: { amount: string; paidLabel: string; description?: string };
}

export const TREASURY_TRANSACTIONS: TreasuryTransaction[] = [
  { id: "eur-8", label: "+ EUR 8", kind: "income", tags: [], date: "Aug 12 09:14" },
  {
    id: "chf-70-unqualified",
    label: "- CHF 70",
    kind: "expense",
    tags: ["Unqualified"],
    date: "Aug 11 16:42",
    detail: { amount: "CHF 70", paidLabel: "Paid Aug 11 16:42", description: "This expense has not been qualified yet." },
  },
  { id: "inr-500", label: "+ INR 500", kind: "income", tags: [], date: "Aug 10 21:08" },
  {
    id: "usd-60-banking",
    label: "- USD 60",
    kind: "expense",
    // Three tags on purpose: the worst-case "+1" overflow example the
    // client asked to see on the list row (client feedback item 14) — the
    // detail page below shows all three, none hidden.
    tags: ["Banking", "Treasury management", "Software licensing"],
    date: "Aug 09 13:25",
    detail: { amount: "USD 60", paidLabel: "Paid Aug 09 13:25" },
  },
];
