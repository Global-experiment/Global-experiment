"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { adminApi } from "../api/client";
import type { AdminPrincipal } from "../api/types";
import { AdminButton, StatusMessage } from "../ui/controls";
import { PropertyRow } from "../ui/RecordForm";

/** /admin/profile — who is signed in, and sign out (revokes the session server-side). */
export function ProfileScreen({ admin }: { admin: AdminPrincipal }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function logout() {
    setPending(true);
    try {
      await adminApi("/auth/logout", { method: "POST" });
      router.replace("/admin/login");
    } catch {
      setPending(false);
      setError("Couldn't sign out. Please try again.");
    }
  }

  return (
    <main>
      <header className="flex h-10 items-center px-2">
        <h1 className="mr-auto text-body font-bold">Profile</h1>
        <AdminButton icon="login" onClick={logout} disabled={pending}>
          {pending ? "Signing out…" : "Sign out"}
        </AdminButton>
      </header>
      {error ? (
        <div className="px-2">
          <StatusMessage tone="error">{error}</StatusMessage>
        </div>
      ) : null}
      <PropertyRow icon="alternate_email" label="Email">
        <span>{admin.email}</span>
      </PropertyRow>
      <PropertyRow icon="lock" label="Role">
        <span className="capitalize">{admin.role}</span>
      </PropertyRow>
    </main>
  );
}
