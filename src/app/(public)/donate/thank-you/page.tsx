import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { fetchCheckoutStatus } from "@/shared/config/publicApi";
import { DONATE_COPY } from "@/shared/donate/copy";
import { donateHref } from "@/shared/donate/donateParams";
import { isDonationCurrency, minorToAmountText, parseAmountToMinor } from "@/shared/donate/money";
import { Container } from "@/shared/ui/Container";
import { FullBleedSeparator } from "@/shared/ui/FullBleedSeparator";
import { IconButton } from "@/shared/ui/IconButton";
import { NavHeader } from "@/shared/ui/NavHeader";
import { PageActionsMenu } from "@/shared/ui/PageActionsMenu";
import { DonationSentToast } from "./DonationSentToast";

export const metadata: Metadata = {
  title: "Thank you — Global Experiment",
  robots: { index: false },
};

const SESSION_ID = /^cs_(test|live)_[A-Za-z0-9]{10,200}$/;
const copy = DONATE_COPY.thankYou;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
const linkClass = "underline underline-offset-2";

/**
 * Thank you (Common pages.pdf p33/p34), Stripe Checkout's success page. The
 * session is checked with Stripe through the API: only a completed donation
 * shows "Donation sent"; an unfinished, unknown or missing session goes back
 * to /donate with the same choice. If the API can't be reached the page
 * still thanks the donor (Stripe sent them here) but makes no claim.
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

  const sessionId = first(params.session_id);
  if (!sessionId || !SESSION_ID.test(sessionId)) redirect(back);
  const status = await fetchCheckoutStatus(sessionId);
  if (status.ok ? status.data.status !== "complete" : status.status === 404) redirect(back);

  const confirmed = status.ok;
  // Delayed methods (SEPA Direct Debit) complete before the money arrives.
  const pending = status.ok && status.data.paymentStatus !== "paid";

  return (
    <main className="flex flex-1 flex-col pb-6">
      <NavHeader
        title={copy.pageTitle}
        actions={
          <>
            <IconButton href="/treasury" label={DONATE_COPY.header.treasuryLink} icon="leaderboard" />
            {/* Common pages p34: the actions only, no lead text. */}
            <PageActionsMenu
              label={DONATE_COPY.header.pageActions}
              actions={[
                { label: DONATE_COPY.menu.donate, icon: "volunteer_activism", href: "/donate" },
                { label: DONATE_COPY.menu.feedback, icon: "lightbulb", href: "/feedback" },
                { label: DONATE_COPY.menu.issue, icon: "new_releases", href: "/issue" },
                { label: DONATE_COPY.menu.documentation, icon: "insert_drive_file", href: "/documentation" },
              ]}
            />
          </>
        }
      />
      {/* p33: heading 4px under the header, text 4px under the heading; full-bleed rule 12px under the text, next heading 12px under the rule; sections 24px apart. */}
      <Container className="pt-1 text-body text-text-primary">
        <h2 className="font-bold">{copy.heading}</h2>
        <p className="mt-1">{copy.body}</p>
        <FullBleedSeparator className="mt-3" />
        <h2 className="mt-3 font-bold">{copy.treasuryHeading}</h2>
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
