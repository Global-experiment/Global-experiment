/**
 * Every visible string of the donate flow, in one place, ready for
 * translation: plain strings, or small functions where a value is inserted.
 *
 * Sources: Common pages.pdf p28–p34 (layout and short copy); the legal text
 * is the client-approved text already on the site (client feedback item 28)
 * — Figma's "Details" paragraphs are a placeholder (Wikimedia wording, "XXXX")
 * and are not used. Policy links stay hidden until the policies exist
 * (decided 2026-10-15). Copy marked "not in Figma" covers states Figma has no
 * frame for and awaits the client's review.
 */

export const DONATE_COPY = {
  pageTitle: "Donate",
  heading: "Donate to the experiment",
  intro: "Thank you for considering donating to the experiment.",

  header: {
    /** Accessible name of the currency control; the visible text is the code (USD). */
    currencyLabel: (currency: string) => `Currency: ${currency}. Change currency`,
    currencySheetLabel: "Choose a currency",
    // Not in Figma: the header's "USD" opens this list.
    currencyNames: { EUR: "Euro (EUR)", USD: "US dollar (USD)", CHF: "Swiss franc (CHF)" },
    treasuryLink: "Treasury",
    pageActions: "Page actions",
  },

  /** The ⋮ sheet (p32); "published" reads as the last ledger update — Figma's date is a placeholder. */
  menu: {
    updated: (when: string) => `This page was updated on ${when}.`,
    partnersBefore: "",
    stripe: "Stripe",
    and: " and ",
    wise: "Wise",
    partnersAfter: " are the banking partners of the experiment.",
    donate: "Donate",
    share: "Share page",
    feedback: "Send feedback",
    issue: "Report issue",
    documentation: "Documentation",
  },

  stats: {
    donations: "Donations",
    median: "Med. donation",
    monthlyDonors: "Monthly donors",
    /** Detail sheets (every stat explains itself — Review #3 item 8). Donations and Monthly donors: not in Figma. */
    donationsDetail: {
      title: "Donations",
      caption: (currency: string) => `Total donated in ${currency}`,
      paragraphs: [
        "The total of all donations received in this currency through the donate page, minus refunds. Each donation is recorded in the public treasury as soon as Stripe confirms it.",
        "Donations made in other currencies are counted separately; switch the currency to see them.",
      ],
    },
    medianDetail: {
      title: "Median donation",
      caption: "Median donation",
      // Common pages / figma.pdf p6, verbatim.
      paragraphs: [
        "The median donation is the middle donation amount when all donations are ordered from smallest to largest. Half of the donations are lower than this amount, and half are higher.",
      ],
    },
    monthlyDonorsDetail: {
      title: "Monthly donors",
      caption: (currency: string) => `Active monthly donations in ${currency}`,
      paragraphs: [
        "The number of monthly donations currently active in this currency. A monthly donation stops counting as soon as it is cancelled.",
      ],
    },
    noValue: "–",
  },

  frequency: {
    label: "Frequency",
    once: "Once",
    monthly: "Monthly",
  },

  amount: {
    label: "Amount",
    other: "Other",
    otherLabel: "Other amount",
    validate: "Validate",
  },

  methods: {
    label: "Payment method",
    card: "Secure payment via Stripe",
    cardName: "Card payment via Stripe",
    applePay: "Apple Pay",
    googlePay: "Google Pay",
    paypal: "PayPal",
    sepa: "Direct debit SEPA",
    redirecting: "Redirecting to Stripe…",
  },

  /** Warning banner (p31) and the other notices, which reuse its layout. */
  notices: {
    close: "Dismiss",
    selectAmount: { title: "Select an amount", message: "Please select an amount" },
    // Not in Figma: the remaining states.
    invalidAmount: { title: "Check the amount" },
    minimum: (amount: string) => `The minimum donation is ${amount}.`,
    maximum: (amount: string) => `The maximum donation is ${amount}.`,
    format: "Enter an amount with at most two decimals.",
    canceled: { title: "Donation canceled", message: "No payment was made. Your choice is kept below." },
    stripeUnavailable: {
      title: "Stripe is unavailable",
      message: "The payment page couldn’t be opened. Nothing was charged. Please try again in a few minutes.",
    },
    rateLimited: {
      title: "Too many attempts",
      message: "Please wait a minute, then try again.",
    },
    methodUnavailable: { title: "Payment method unavailable" },
    openSoon: {
      title: "Donations open soon",
      message: "Donations aren’t open yet. Thank you for your patience — please come back soon.",
    },
    donationsUnavailable: {
      title: "Donations are unavailable",
      message: "Donations can’t be received right now. Please come back later.",
    },
  },

  details: {
    heading: "Details",
    /** Client-approved legal text (item 28). `{portal}` marks the subscription-management link. */
    paragraphs: [
      "The Global Experiment is a Swiss non-profit association. Donations support the development, operation and public-interest activities of the initiative. Donations do not purchase goods, services or ownership rights, and do not grant donors control over the organisation or its decisions.",
      "Payments are securely processed by Stripe. Stripe may offer card payments, Apple Pay, Google Pay, PayPal and other payment methods depending on the donor’s country, currency, device and eligibility. Payment details are processed by Stripe and are not stored directly by the Global Experiment. Stripe’s fees and any applicable currency-conversion costs are deducted before funds are paid out to the association’s Wise account.",
      "One-time donations are charged once. Monthly donations are charged automatically using the payment method authorised at checkout until the donor cancels them. The amount, currency and frequency are shown before confirmation. A payment may fail, be delayed, be reversed or be disputed in accordance with the applicable payment method’s rules.",
    ],
    cancellationBefore: "Monthly donations can be cancelled at any time through the available ",
    cancellationLink: "subscription-management link",
    cancellationMiddle: " or by contacting ",
    contactEmail: "donations@globalexperiment.org",
    cancellationAfter:
      ". Cancellation normally prevents future charges but does not automatically reverse payments that have already been completed. Refund requests are assessed in accordance with the association’s refund policy and applicable law.",
    paragraphsAfter: [
      "Receipts are issued for successful payments where an email address has been provided. A donation receipt does not necessarily constitute a tax certificate. Tax deductibility depends on the donor’s country and applicable law; donors should consult the relevant tax authority or adviser.",
      "The Global Experiment does not sell or trade donor information. Personal data is processed only for purposes such as payment processing, donation records, receipts, fraud prevention, accounting, legal compliance and donor support. Stripe, Wise and other service providers may process relevant information on behalf of the association, including in countries outside Switzerland or the donor’s country. Further information, including data-retention periods and data-subject rights, is available in the Privacy Policy.",
      "Donations are recorded in the association’s financial records and may be included in aggregated or anonymised public reports. A donor’s name, email address and donation details are not publicly displayed by default.",
      "By confirming a donation, the donor acknowledges this information and agrees to the processing of personal data described in the Privacy Policy and, where applicable, the Donation and Refund Policy.",
    ],
  },

  thankYou: {
    pageTitle: "Donate",
    heading: "Thank you",
    body: "Thank you for your generous donation. Your support helps the experiment continue its mission and advance its goals. Every contribution, regardless of its size, makes a meaningful difference. The experiment sincerely appreciates your generosity, trust, and commitment.",
    treasuryHeading: "Treasury update",
    // Figma says "updated every 4h"; the treasury now updates as soon as Stripe confirms (on-demand revalidation).
    treasuryBefore: "Your donation will appear on the ",
    treasuryLink: "treasury page",
    treasuryAfter: " as soon as Stripe confirms the payment, usually within a few minutes.",
    // Delayed methods (SEPA Direct Debit) confirm later.
    treasuryPendingAfter: " once the payment has cleared. Bank debits can take a few business days.",
    spentHeading: "How it is spent",
    spentBody: "Spendings are decided by the admin team and are exclusively focused on developing the platform.",
    spentLink: "The treasury",
    spentAfter: " is public record and accessible to all.",
    toast: "Donation sent",
  },
} as const;
