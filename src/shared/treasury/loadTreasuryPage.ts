import { fetchTreasuryEntries, fetchTreasuryOverview } from "@/shared/config/publicApi";
import { DEFAULT_TREASURY_STATE, HISTORY_PAGE_SIZE, historyCurrencies, parseTreasuryParams, statsCurrency } from "./treasuryParams";

type SearchParams = Parameters<typeof parseTreasuryParams>[0];

/**
 * Everything the Treasury page renders, from the native API — shared by
 * the public page and the admin's public view of it. While
 * treasury.public_toolbar is off (decided 2026-10-19) only the type pills
 * and the page number come from the URL: the stats are in the
 * treasury.stats_currency setting and the history lists every currency.
 */
export async function loadTreasuryPage(searchParams: SearchParams) {
  const fromUrl = parseTreasuryParams(searchParams);
  let overview = await fetchTreasuryOverview();
  const toolbar = overview.ok && overview.data.publicToolbar === true;
  const state = toolbar ? fromUrl : { ...DEFAULT_TREASURY_STATE, type: fromUrl.type, page: fromUrl.page };
  if (toolbar && overview.ok && statsCurrency(state) !== overview.data.currency) overview = await fetchTreasuryOverview(statsCurrency(state));
  const history = await fetchTreasuryEntries({
    type: state.type ?? undefined,
    currency: toolbar ? historyCurrencies(state) : [],
    from: state.from ?? undefined,
    to: state.to ?? undefined,
    expenseType: state.expenseTypes,
    q: state.q ?? undefined,
    sort: state.sort,
    page: state.page,
    pageSize: HISTORY_PAGE_SIZE,
  });
  return {
    state,
    toolbar,
    overview: overview.ok ? overview.data : null,
    history: history.ok ? history.data : null,
    now: new Date().toISOString(),
  };
}
