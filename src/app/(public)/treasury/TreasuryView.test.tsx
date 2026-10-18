import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { TreasuryEntriesPage, TreasuryOverview } from "@/shared/config/publicApi";
import { DEFAULT_TREASURY_STATE } from "@/shared/treasury/treasuryParams";
import { TreasuryView } from "./TreasuryView";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: () => undefined, push: () => undefined }),
  usePathname: () => "/treasury",
  useSearchParams: () => new URLSearchParams(),
}));

// Test fixtures only.
const overview: TreasuryOverview = {
  currency: "USD",
  wiseConnected: false,
  sampleFigures: true,
  balance: 9_130_000,
  sustainability: 1.4,
  trends: { balance: 2.1, sustainability: 2.1, medianDonation: null, expenses: 1.8 },
  medianDonation: 640,
  donationCount: 5,
  expensesTotal: 577_500,
  expenseCount: 3,
  donationAppeal: false,
  lastUpdatedAt: null,
  filters: { currencies: ["USD"], expenseTypes: [], firstDate: null, lastDate: null },
};
const history: TreasuryEntriesPage = { items: [], total: 0, page: 1, pageSize: 25 };
const render = (value: TreasuryOverview) =>
  renderToStaticMarkup(<TreasuryView state={DEFAULT_TREASURY_STATE} overview={value} history={history} now="2026-10-15T12:00:00Z" />);

describe("Treasury stats", () => {
  it("shows the sample Balance and Sustainability with their trends, and says they are samples", () => {
    const html = render(overview);
    expect(html).toContain("$ 91.3K");
    expect(html).toContain("+2.1%");
    expect(html).toContain("5.8K");
    expect(html).toContain("+1.8%");
    expect(html).toContain("Balance and Sustainability are sample figures until the Wise account is connected.");
  });

  it("renders an overview from an older API (cached before a deploy: no trends, no sample flag) instead of failing", () => {
    const older: TreasuryOverview = { ...overview, balance: null, sustainability: null };
    delete older.trends;
    delete older.sampleFigures;
    const html = render(older);
    expect(html).toContain("Med. donation");
    expect(html).not.toContain("+1.8%");
    expect(html).not.toContain("Balance");
  });
});
