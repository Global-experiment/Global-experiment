import type { Metadata } from "next";
import { Suspense } from "react";
import { TreasuryList } from "@/modules/admin/treasury/TreasuryList";

export const metadata: Metadata = { title: "Treasury" };

export default function AdminTreasuryListPage() {
  return (
    <Suspense>
      <TreasuryList />
    </Suspense>
  );
}
