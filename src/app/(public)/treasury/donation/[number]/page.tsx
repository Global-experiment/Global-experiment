import type { Metadata } from "next";
import { EntryDetail, loadEntry } from "@/shared/treasury/EntryDetail";

export const metadata: Metadata = {
  title: "Donation — Global Experiment Treasury",
};

/**
 * An anonymous donation (Common pages p26–p27) — or a refund or dispute
 * adjustment of one — from the public API; 404 unless it's public.
 */
export default async function DonationPage(props: PageProps<"/treasury/donation/[number]">) {
  const { number } = await props.params;
  return <EntryDetail entry={await loadEntry(number, "donation")} route="donation" now={new Date()} />;
}
