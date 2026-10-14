/**
 * Every word of the public Treasury pages, in one place (Common pages
 * p11–p16 list, sheets and filters; p22–p23 expense; p26–p27 anonymous
 * donation). Wording is Figma's unless a comment says why it differs.
 */
export const TREASURY_COPY = {
  pageTitle: "Treasury",
  header: {
    currencyLabel: (currency: string) => `Currency: ${currency}. Change currency`,
    currencySheetLabel: "Choose a currency",
    currencyNames: { USD: "US dollar (USD)", EUR: "Euro (EUR)", CHF: "Swiss franc (CHF)", all: "All currencies" } as Record<string, string>,
    allShort: "All",
    pageActions: "Page actions",
    treasuryLink: "Treasury",
  },
  menu: {
    // Figma: "updated every 4 hours". The page now refreshes as soon as an entry changes (on-demand revalidation, 5-minute fallback).
    refresh: "The treasury page is updated within minutes.",
    lastUpdated: (when: string) => `Last updated at ${when}.`,
    donate: "Donate",
    share: "Share page",
    feedback: "Send feedback",
    issue: "Report issue",
    documentation: "Documentation",
  },
  toolbar: {
    sortButton: (field: string, direction: string) => `${field}, ${direction}`,
    sortLabel: (field: string, direction: string) => `Sort: ${field}, ${direction}. Change sort`,
    filter: "Filter",
    filterActive: (count: number) => `Filter (${count})`,
    filterLabel: (count: number) => (count === 0 ? "Filter the history" : `Filter the history, ${count} active`),
  },
  pills: { label: "Show", expenses: "Expenses", donations: "Donations" },
  sort: {
    title: "Sort by",
    date: "Date",
    amount: "Amount",
    directions: {
      date_desc: "Latest first",
      date_asc: "Oldest first",
      amount_desc: "Largest first",
      amount_asc: "Smallest first",
    },
  },
  filter: {
    title: "Filter",
    erase: "Erase filters",
    donations: "Donations",
    expenses: "Expenses",
    date: "Date",
    currency: "Currency",
    expenseType: "Expense type",
    all: "All",
    reset: "Reset",
    apply: "Apply filter",
    dateTitle: "Filter dates",
    currencyTitle: "Filter currencies",
    expenseTypeTitle: "Filter expense types",
    from: "From",
    to: "To",
    // Figma's sheet lists currencies by name ("Dollar, Euro, Yuan, Yen").
    currencyNames: { USD: "Dollar", EUR: "Euro", CHF: "Swiss franc", all: "All currencies" } as Record<string, string>,
    presets: {
      this_week: "This week",
      this_month: "This month",
      last_6_months: "Last 6 months",
      this_year: "This year",
      all: "All",
    },
    rangeFrom: (from: string) => `From ${from}`,
    rangeTo: (to: string) => `Until ${to}`,
    invalidRange: "The start date must be before the end date.",
  },
  stats: {
    balance: "Balance",
    sustainability: "Sustainability",
    median: "Med. donation",
    expenses: "Expenses",
    noValue: "–",
    balanceDetail: {
      title: "Balance",
      caption: "Treasury balance",
      paragraphs: [
        "The balance represents the current funds available in the experiment’s Wise account. All funds are publicly disclosed, with no hidden reserves.",
      ],
    },
    sustainabilityDetail: {
      title: "Sustainability",
      caption: "Sustainability score",
      paragraphs: [
        { body: "The sustainability score estimates how long the experiment could continue using its current balance, based on its average monthly expenses over the past six months. A score of 0 indicates no financial reserve, while a score of 10 indicates approximately three years of available funding." },
        {
          heading: "How it is calculated",
          body: "It calculates the average monthly expenses from the past six months. It divides the current balance by that monthly average to estimate how many months the experiment could continue without receiving new donations. It converts that estimate into a score from 0 to 10. The logarithmic scale gives more detail to shorter runways, while gradually reducing the difference between longer ones. A runway of 36 months or more receives the maximum score of 10.",
        },
      ],
    },
    medianDetail: {
      title: "Median donation",
      caption: (currency: string) => `Median donation in ${currency}`,
      paragraphs: [
        "The median donation is the middle donation amount when all donations are ordered from smallest to largest. Half of the donations are lower than this amount, and half are higher.",
      ],
    },
    // No Figma frame for this sheet: wording describes exactly how the figure is computed.
    expensesDetail: {
      title: "Expenses",
      caption: (currency: string) => `Total expenses in ${currency}`,
      paragraphs: [
        { body: "Expenses is the total of every published expense paid in this currency. Each one is listed in the history, with what it was spent on." },
        { heading: "How it is calculated", body: "It adds up the published expenses in the selected currency. Amounts in other currencies are never converted: switch the currency to see them. Donations are not counted." },
      ],
    },
  },
  appeal: {
    title: "Cry for donation",
    dismiss: "Dismiss",
    before: "The ",
    sustainability: "sustainability",
    middle: " of the experiment is currently low, please consider ",
    donating: "donating",
    after: " to help the platform run.",
  },
  history: {
    heading: "History",
    empty: "No entries yet. Donations and expenses appear here as soon as they’re published.",
    noMatch: "No entries match these filters.",
    unavailable: "The Treasury history is unavailable right now. Please try again in a few minutes.",
    notQualified: "Not qualified yet",
    moreTags: (count: number) => `${count} more ${count === 1 ? "tag" : "tags"}`,
    kinds: { expense: "Expense", donation: "Donation", refund: "Refund", dispute: "Dispute adjustment" } as Record<string, string>,
    pagination: "History pages",
    newer: "Newer",
    older: "Older",
    page: (page: number, pages: number) => `Page ${page} of ${pages}`,
  },
  donateCta: "Donate",
  entry: {
    titles: { expense: "Expense", donation: "Donation", refund: "Refund", dispute: "Dispute" } as Record<string, string>,
    when: {
      expense: (time: string) => `Paid ${time}`,
      donation: (time: string) => `Donated ${time}`,
      refund: (time: string) => `Refunded ${time}`,
      dispute: (time: string) => `Disputed ${time}`,
    } as Record<string, (time: string) => string>,
    paidTo: (name: string) => `Paid to ${name}`,
    monthly: "Monthly donation",
    adjusts: (kind: string) => (kind === "refund" ? "Refund of " : "Adjusts "),
    adjustsLink: (number: number) => `donation #${number}`,
    unavailable: "This entry is unavailable right now. Please try again in a few minutes.",
    share: "Share",
    feedback: "Send feedback",
    menu: {
      expense: (amount: string, moment: string) => `This expense of ${amount} was made on ${moment}.`,
      donation: (amount: string, day: string) => `This anonymous donation of ${amount} was made on ${day}.`,
      refund: (amount: string, day: string) => `This refund of ${amount} was made on ${day}.`,
      dispute: (amount: string, day: string) => `This dispute adjustment of ${amount} was made on ${day}.`,
    } as Record<string, (amount: string, when: string) => string>,
    why: {
      title: "Why donations matter",
      body: "The experiment only source of income is donations, the platform is online thanks to its donators and them only.",
    },
    spent: {
      title: "How it is spent",
      body: "Spendings are decided by the admin team and are exclusively focused on developing the platform.",
      record: "The treasury is public record and accessible to all.",
      readMore: "Read more",
    },
  },
} as const;
