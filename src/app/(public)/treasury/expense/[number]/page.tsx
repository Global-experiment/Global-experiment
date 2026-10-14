import type { Metadata } from "next";
import { EntryDetail, loadEntry } from "@/shared/treasury/EntryDetail";

export const metadata: Metadata = {
  title: "Expense — Global Experiment Treasury",
};

/** An expense (Common pages p22–p23), from the public API; 404 unless it's public. */
export default async function ExpensePage(props: PageProps<"/treasury/expense/[number]">) {
  const { number } = await props.params;
  return <EntryDetail entry={await loadEntry(number, "expense")} route="expense" now={new Date()} />;
}
