import type { Metadata } from "next";
import { Suspense } from "react";
import { HistoryScreen } from "@/modules/admin/history/HistoryScreen";

export const metadata: Metadata = { title: "History" };

export default function AdminHistoryPage() {
  return (
    <Suspense>
      <HistoryScreen />
    </Suspense>
  );
}
