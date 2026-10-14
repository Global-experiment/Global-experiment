import type { Metadata } from "next";
import { fetchTreasuryEntries, fetchTreasuryOverview } from "@/shared/config/publicApi";
import { HISTORY_PAGE_SIZE, historyCurrencies, parseTreasuryParams, statsCurrency } from "@/shared/treasury/treasuryParams";
import { TreasuryView } from "./TreasuryView";

export const metadata: Metadata = {
  title: "Treasury — Global Experiment",
  description: "Every published donation and expense of the Global Experiment, per currency.",
};

/**
 * Treasury (Common pages.pdf p11–p16), from the native API: the stats of
 * one currency, the "Cry for donation" banner when it's switched on, and
 * the history with its sort, filters and pages — all in the URL
 * (treasuryParams), rendered here on the server. Figures are cached under
 * the `treasury` tag, refreshed on demand after every change with a
 * 5-minute fallback. Nothing here is demo data: an empty ledger shows an
 * empty history.
 */
export default async function TreasuryPage(props: PageProps<"/treasury">) {
  const state = parseTreasuryParams(await props.searchParams);
  const [overview, history] = await Promise.all([
    fetchTreasuryOverview(statsCurrency(state)),
    fetchTreasuryEntries({
      type: state.type ?? undefined,
      currency: historyCurrencies(state),
      from: state.from ?? undefined,
      to: state.to ?? undefined,
      expenseType: state.expenseTypes,
      sort: state.sort,
      page: state.page,
      pageSize: HISTORY_PAGE_SIZE,
    }),
  ]);

  return (
    <TreasuryView
      state={state}
      overview={overview.ok ? overview.data : null}
      history={history.ok ? history.data : null}
      now={new Date().toISOString()}
    />
  );
}
