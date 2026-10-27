import type { Metadata } from "next";
import { fetchDonationConfig, fetchDonationSummary } from "@/shared/config/publicApi";
import { parseDonateParams } from "@/shared/donate/donateParams";
import { DonateForm } from "./DonateForm";

export const metadata: Metadata = {
  title: "Donate",
};

/**
 * Donate (Common pages.pdf p28–p32). The server reads the choice in the URL
 * (currency, amount, frequency — kept through Stripe's cancel link), the
 * donation settings (never cached) and the Treasury figures for that
 * currency (cached, revalidated on demand after every ledger write), then
 * hands them to the interactive form. Nothing here is demo data: before the
 * first donation the figures are simply zero. Until donations open
 * (donations.enabled) the page says "Donations open soon" and offers no
 * payment; `?preview=<token>` (DONATIONS_PREVIEW_TOKEN) opens it privately.
 */
export default async function DonatePage(props: PageProps<"/donate">) {
  const params = await props.searchParams;
  const preview = parseDonateParams(params, { currency: "USD", monthlyEnabled: false }).preview;
  const configResult = await fetchDonationConfig(preview ?? undefined);
  const config = configResult.ok ? configResult.data : null;
  const initial = parseDonateParams(params, {
    currency: config?.defaultCurrency ?? "USD",
    monthlyEnabled: config?.monthly ?? false,
  });
  const summaryResult = config ? await fetchDonationSummary(initial.currency) : null;
  const summary = summaryResult?.ok ? summaryResult.data : null;

  return <DonateForm config={config} summary={summary} initial={initial} lastUpdated={formatUpdated(summary?.lastEntryAt ?? null)} />;
}

/** Common pages p32 style, "April 6 at 2:07PM" — in the association's time zone (Switzerland). */
function formatUpdated(iso: string | null): string | null {
  if (!iso) return null;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Zurich", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true })
      .formatToParts(new Date(iso))
      .map((part) => [part.type, part.value]),
  );
  return `${parts.month} ${parts.day} at ${parts.hour}:${parts.minute}${String(parts.dayPeriod).toUpperCase()}`;
}
