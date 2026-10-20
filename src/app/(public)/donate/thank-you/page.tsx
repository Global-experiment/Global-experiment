import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { fetchCheckoutStatus, fetchPaymentIntentStatus } from "@/shared/config/publicApi";
import { DONATE_COPY } from "@/shared/donate/copy";
import { donateHref } from "@/shared/donate/donateParams";
import { isDonationCurrency, minorToAmountText, parseAmountToMinor } from "@/shared/donate/money";
import { Container } from "@/shared/ui/Container";
import { FullBleedSeparator } from "@/shared/ui/FullBleedSeparator";
import { NavHeader } from "@/shared/ui/NavHeader";
import { DonationSentToast } from "./DonationSentToast";

export const metadata: Metadata = {
  title: "Thank you — Global Experiment",
  robots: { index: false },
};

const SESSION_ID = /^cs_(test|live)_[A-Za-z0-9]{10,200}$/;
const PAYMENT_INTENT_ID = /^pi_[A-Za-z0-9]{10,200}$/;
const copy = DONATE_COPY.thankYou;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
const linkClass = "underline underline-offset-2";

/**
 * Thank you (Common pages.pdf p33/p34), Stripe Checkout's success page. The
 * session is checked with Stripe through the API: only a completed donation
 * shows "Donation sent"; an unfinished, unknown or missing session goes back
 * to /donate with the same choice. If the API can't be reached the page
 * still thanks the donor (Stripe sent them here) but makes no claim.
 *
 * A card donation paid on the donate page (embedded card fields, decided
 * 2026-10-19) arrives with `payment_intent` instead: a succeeded or
 * processing payment shows "Donation sent" and its reference — the donor
 * gave no email, so the reference replaces the receipt.
 */
export default async function ThankYouPage(props: PageProps<"/donate/thank-you">) {
  const params = await props.searchParams;
  const currencyParam = first(params.currency)?.toUpperCase();
  const amountMinor = parseAmountToMinor(first(params.amount) ?? "");
  const back = isDonationCurrency(currencyParam)
    ? donateHref({
        currency: currencyParam,
        amountText: amountMinor === null ? null : minorToAmountText(amountMinor),
        frequency: first(params.frequency) === "monthly" ? "monthly" : "once",
      })
    : "/donate";

  const paymentIntentId = first(params.payment_intent);
  let confirmed: boolean;
  let pending: boolean;
  let reference: string | null = null;
  if (paymentIntentId !== undefined) {
    if (!PAYMENT_INTENT_ID.test(paymentIntentId)) redirect(back);
    const intent = await fetchPaymentIntentStatus(paymentIntentId);
    if (intent.ok ? intent.data.status !== "succeeded" && intent.data.status !== "processing" : intent.status === 404) redirect(back);
    confirmed = intent.ok;
    pending = intent.ok && intent.data.status === "processing";
    reference = intent.ok ? intent.data.reference : null;
  } else {
    const sessionId = first(params.session_id);
    if (!sessionId || !SESSION_ID.test(sessionId)) redirect(back);
    const status = await fetchCheckoutStatus(sessionId);
    if (status.ok ? status.data.status !== "complete" : status.status === 404) redirect(back);
    confirmed = status.ok;
    // Delayed methods (SEPA Direct Debit) complete before the money arrives.
    pending = status.ok && status.data.paymentStatus !== "paid";
  }

  return (
    <main className="flex flex-1 flex-col pb-6">
      <NavHeader
        title={copy.pageTitle}
        // Never the payment in this URL: sharing invites to donate.
        shareUrl="/donate"
        // Common pages p34: the actions only, no lead text; the Treasury link moved from the header into the menu (client review 2026-10-21).
        menu={{
          label: DONATE_COPY.header.pageActions,
          actions: [
            { label: DONATE_COPY.menu.donate, icon: "volunteer_activism", href: "/donate" },
            { label: DONATE_COPY.menu.feedback, icon: "lightbulb", href: "/feedback" },
            { label: DONATE_COPY.menu.issue, icon: "new_releases", href: "/issue" },
            { label: DONATE_COPY.menu.documentation, icon: "insert_drive_file", href: "/documentation" },
            { label: DONATE_COPY.header.treasuryLink, icon: "leaderboard", href: "/treasury" },
          ],
        }}
      />
      {/* p33: heading 4px under the header, text 4px under the heading; full-bleed rule 12px under the text, next heading 12px under the rule; sections 24px apart. */}
      <Container className="pt-1 text-body text-text-primary">
        <h2 className="font-bold">{copy.heading}</h2>
        <p className="mt-1">{copy.body}</p>
        <FullBleedSeparator className="mt-3" />
        {reference ? (
          <>
            <h2 className="mt-3 font-bold">{copy.referenceHeading}</h2>
            <p className="mt-1" data-donation-reference>
              {copy.referenceBody(reference)}
            </p>
          </>
        ) : null}
        <h2 className={`${reference ? "mt-6" : "mt-3"} font-bold`}>{copy.treasuryHeading}</h2>
        <p className="mt-1">
          {copy.treasuryBefore}
          <Link href="/treasury" className={linkClass}>
            {copy.treasuryLink}
          </Link>
          {pending ? copy.treasuryPendingAfter : copy.treasuryAfter}
        </p>
        <h2 className="mt-6 font-bold">{copy.spentHeading}</h2>
        <p className="mt-1">{copy.spentBody}</p>
        <p>
          <Link href="/treasury" className={linkClass}>
            {copy.spentLink}
          </Link>
          {copy.spentAfter}
        </p>
      </Container>
      {confirmed ? <DonationSentToast message={copy.toast} /> : null}
    </main>
  );
}
