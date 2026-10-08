"use client";

import { useState } from "react";
import { adminApi, AdminApiError } from "../api/client";
import { safeAdminNext } from "../api/paths";
import { AdminButton, StatusMessage } from "../ui/controls";
import { recordInput } from "../ui/RecordForm";

/**
 * Owner sign-in against the native API (POST /api/admin/auth/login). The
 * session lives only in the API's HttpOnly cookie; this form never sees or
 * stores a token. No signup, no password reset (not specified for v0.1).
 */
export function LoginForm({ next }: { next?: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await adminApi("/auth/login", { method: "POST", body: { email, password } });
      // Full navigation so the server layout re-checks the new session.
      window.location.assign(safeAdminNext(next));
    } catch (caught) {
      setPending(false);
      if (caught instanceof AdminApiError && caught.status === 429) setError("Too many attempts. Please wait and try again.");
      else if (caught instanceof AdminApiError && (caught.status === 401 || caught.status === 400)) setError("Email or password is incorrect.");
      else setError(caught instanceof AdminApiError ? caught.message : "Sign-in failed.");
    }
  }

  return (
    <main data-admin className="flex min-h-dvh items-center justify-center bg-surface-base px-2 font-normal text-text-primary">
      <form onSubmit={submit} className="flex w-full max-w-[360px] flex-col gap-2" aria-describedby={error ? "login-error" : undefined}>
        <h1 className="text-body font-bold">Global Experiment admin</h1>
        <label htmlFor="login-email" className="mt-2 text-body text-text-muted">
          Email
        </label>
        <input
          id="login-email"
          type="email"
          inputMode="email"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className={recordInput}
        />
        <label htmlFor="login-password" className="mt-1 text-body text-text-muted">
          Password
        </label>
        <input
          id="login-password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className={recordInput}
        />
        {error ? (
          <div id="login-error">
            <StatusMessage tone="error">{error}</StatusMessage>
          </div>
        ) : null}
        <AdminButton type="submit" icon="login" disabled={pending || !email || !password} className="mt-2 self-start">
          {pending ? "Signing in…" : "Sign in"}
        </AdminButton>
      </form>
    </main>
  );
}
