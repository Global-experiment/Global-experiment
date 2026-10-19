import type { Metadata } from "next";
import { fetchTreasuryEntries, fetchTreasuryOverview } from "@/shared/config/publicApi";
import { DEFAULT_TREASURY_STATE, HISTORY_PAGE_SIZE, historyCurrencies, parseTreasuryParams, statsCurrency } from "@/shared/treasury/treasuryParams";
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
 *
 * Decided 2026-10-19: while treasury.public_toolbar is off (the default) the
 * page has no currency switch, search, sort or filters — the stats are in
 * the treasury.stats_currency setting and the history lists every currency,
 * latest first; only the Expenses / Donations pills and the pages stay. The
 * toolbar's code stays, ready for the setting.
 */
export default async function TreasuryPage(props: PageProps<"/treasury">) {
  const fromUrl = parseTreasuryParams(await props.searchParams);
  let overview = await fetchTreasuryOverview();
  const toolbar = overview.ok && overview.data.publicToolbar === true;
  const state = toolbar ? fromUrl : { ...DEFAULT_TREASURY_STATE, type: fromUrl.type, page: fromUrl.page };
  if (toolbar && overview.ok && statsCurrency(state) !== overview.data.currency) overview = await fetchTreasuryOverview(statsCurrency(state));
  const [history] = await Promise.all([
    fetchTreasuryEntries({
      type: state.type ?? undefined,
      currency: toolbar ? historyCurrencies(state) : [],
      from: state.from ?? undefined,
      to: state.to ?? undefined,
      expenseType: state.expenseTypes,
      q: state.q ?? undefined,
      sort: state.sort,
      page: state.page,
      pageSize: HISTORY_PAGE_SIZE,
    }),
  ]);

  return (
    <TreasuryView
      state={state}
      toolbar={toolbar}
      overview={overview.ok ? overview.data : null}
      history={history.ok ? history.data : null}
      now={new Date().toISOString()}
    />
  );
}
