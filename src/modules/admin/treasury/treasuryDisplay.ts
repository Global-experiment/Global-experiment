import type { TreasuryEntryRow } from "../api/types";

/** How the admin writes Treasury values (no Figma frame: the existing admin table and record vocabulary). */

export const TYPE_LABEL: Record<TreasuryEntryRow["type"], string> = {
  expense: "Expense",
  donation: "Donation",
  refund: "Refund",
  dispute: "Dispute",
};

export const SOURCE_LABEL: Record<TreasuryEntryRow["source"], string> = { stripe: "Stripe", wise: "Wise", manual: "Manual" };

export const PUBLICATION_LABEL: Record<TreasuryEntryRow["publication"], string> = { published: "Published", unpublished: "Unpublished" };

/** Published but not shown to visitors (a hidden Stripe mode, or unreviewed while unqualified entries stay private). */
export const NOT_PUBLIC_LABEL = "Published, not public";

export const publicationLabel = (row: Pick<TreasuryEntryRow, "publication" | "publicNow">) =>
  row.publication !== "published" ? PUBLICATION_LABEL.unpublished : row.publicNow ? PUBLICATION_LABEL.published : NOT_PUBLIC_LABEL;

export const CADENCE_LABEL: Record<string, string> = { one_off: "One-off", monthly: "Monthly", yearly: "Yearly" };

/** Live = real money; Test = Stripe test mode (public in production only before go-live, with treasury.show_test_donations). */
export const modeLabel = (row: Pick<TreasuryEntryRow, "livemode" | "sample">) => (row.sample ? "Sample" : row.livemode ? "Live" : "Test");

export const managedLabel = (row: Pick<TreasuryEntryRow, "managedBy" | "source">) =>
  row.managedBy === "notion" ? "Notion" : row.source === "stripe" ? "Stripe" : "Native";

const amount = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "−USD 5,675.00", "USD 12.50" — the shared rule (formatting.md): exact, signed with a real minus. */
export { formatMoney } from "@/shared/format/numbers";

/** Gross / fee / net on one line: "USD 50.00 / 1.75 / 48.25"; an unknown fee shows "—". */
export function formatBreakdown(row: Pick<TreasuryEntryRow, "grossAmount" | "feeAmount" | "netAmount" | "currency">): string {
  const part = (minor: number | null) => (minor === null ? "—" : `${minor < 0 ? "−" : ""}${amount.format(Math.abs(minor) / 100)}`);
  return `${part(row.grossAmount)} / ${part(row.feeAmount)} / ${part(row.netAmount)}`;
}

const day = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
// The browser's zone, like every other admin date (formatPanelDate); the public pages use Zurich.
const dateTime = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

/** The entry's date, with its time when it has one. */
export function formatOccurred(row: Pick<TreasuryEntryRow, "occurredOn" | "occurredAt">): string {
  return row.occurredAt ? dateTime.format(new Date(row.occurredAt)) : day.format(new Date(`${row.occurredOn}T00:00:00Z`));
}

const units = ["B", "KB", "MB"];
export function formatBytes(bytes: number): string {
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${unit === 0 ? value : value.toFixed(1)} ${units[unit]}`;
}

/** Same limits as the API (treasury-documents.schema.ts): checked here only to answer at once. */
export const DOCUMENT_TYPES = ["application/pdf", "image/png", "image/jpeg"] as const;
export const DOCUMENT_MAX_BYTES = 20 * 1024 * 1024;
export const DOCUMENT_ACCEPT = ".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg";
