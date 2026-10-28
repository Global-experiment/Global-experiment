import type { Metadata } from "next";
import { Suspense } from "react";
import { AccountsList } from "@/modules/admin/accounts/AccountsList";

export const metadata: Metadata = { title: "Accounts" };

export default function AdminAccountsPage() {
  return (
    <Suspense>
      <AccountsList />
    </Suspense>
  );
}
