"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { adminApi, AdminApiError } from "../api/client";
import { adminDisplayName, type AdminPrincipal } from "../api/types";
import { AdminButton, StatusMessage } from "../ui/controls";
import { PropertyRow, recordInput } from "../ui/RecordForm";
import { useToast } from "../ui/Toast";

const MAX_DISPLAY_NAME = 80;

/**
 * /admin/profile — who is signed in, the display name shown on the user
 * card (empty = the part of the email before "@"), and sign out (revokes
 * the session server-side).
 */
export function ProfileScreen({ admin }: { admin: AdminPrincipal }) {
  const router = useRouter();
  const toast = useToast();
  const [saved, setSaved] = useState(admin.displayName ?? "");
  const [name, setName] = useState(saved);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<"saving" | "signing-out" | null>(null);
  const dirty = name.trim() !== saved;

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!dirty) return;
    setPending("saving");
    setError(null);
    try {
      const result = await adminApi<{ admin: AdminPrincipal }>("/auth/profile", { method: "PATCH", body: { displayName: name } });
      const next = result.admin.displayName ?? "";
      setSaved(next);
      setName(next);
      toast("Profile updated");
      router.refresh(); // the user card is rendered from the session by the layout
    } catch (caught) {
      setError(caught instanceof AdminApiError ? (caught.issues[0]?.message ?? caught.message) : "Couldn't save.");
    } finally {
      setPending(null);
    }
  }

  async function logout() {
    setPending("signing-out");
    try {
      await adminApi("/auth/logout", { method: "POST" });
      router.replace("/admin/login");
    } catch {
      setPending(null);
      setError("Couldn't sign out. Please try again.");
    }
  }

  return (
    <main>
      <header className="flex h-10 items-center px-2">
        <h1 className="mr-auto text-body font-bold">Profile</h1>
        <AdminButton icon="login" onClick={logout} disabled={pending !== null}>
          {pending === "signing-out" ? "Signing out…" : "Sign out"}
        </AdminButton>
      </header>
      <form onSubmit={save} noValidate className="flex flex-col gap-4 px-2 pt-2">
        {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}
        <PropertyRow icon="title" label="Display name" htmlFor="profile-display-name">
          <input
            id="profile-display-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={MAX_DISPLAY_NAME}
            autoComplete="name"
            placeholder={adminDisplayName({ email: admin.email, displayName: null })}
            aria-describedby="profile-display-name-help"
            className={`${recordInput} max-w-[480px]`}
          />
          <p id="profile-display-name-help" className="px-2 text-meta text-text-muted">
            Shown on the user card. Up to {MAX_DISPLAY_NAME} characters; leave empty to use the start of your email address.
          </p>
        </PropertyRow>
        <PropertyRow icon="alternate_email" label="Email">
          <span className="px-2">{admin.email}</span>
        </PropertyRow>
        <PropertyRow icon="lock" label="Role">
          <span className="px-2 capitalize">{admin.role}</span>
        </PropertyRow>
        <div className="pl-[168px]">
          <AdminButton type="submit" icon="check_circle" disabled={!dirty || pending !== null}>
            {pending === "saving" ? "Saving…" : "Save"}
          </AdminButton>
        </div>
      </form>
    </main>
  );
}
