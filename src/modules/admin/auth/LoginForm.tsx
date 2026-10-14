"use client";

import { useState } from "react";
import { adminApi, AdminApiError } from "../api/client";
import { safeAdminNext } from "../api/paths";
import { AdminIcon, type AdminIconName } from "../ui/adminIcons";
import { focusRing } from "../ui/controls";

/**
 * Owner sign-in (admin-desktop.pdf p1) against the native API (POST
 * /api/admin/auth/login). The session lives only in the API's HttpOnly
 * cookie; this form never sees or stores a token.
 *
 * Measured on the frame: a 400px card, 1px #484848 ring, 8px corners, 8px
 * padding; a 40px title row; 40px fields 8px apart with a 16px glyph 8px
 * in and the placeholder at 28px; two 40px buttons side by side
 * (secondary outlined, primary white) with 8px between them.
 *
 * "Forgot password?" has no flow yet (no email sending exists): it says
 * whom to ask, and stays a real button so the reset flow can plug in.
 */
export function LoginForm({ next }: { next?: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!email || !password) {
      setNotice(null);
      setError("Enter your email address and password.");
      return;
    }
    setPending(true);
    setError(null);
    setNotice(null);
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
    <main data-admin className="flex min-h-dvh items-center justify-center bg-surface-base px-4 font-normal text-text-primary">
      <form
        onSubmit={submit}
        noValidate
        aria-labelledby="login-title"
        aria-describedby={error ? "login-error" : notice ? "login-notice" : undefined}
        className="w-full max-w-[400px] rounded-lg px-2 pb-2 ring-1 ring-line"
      >
        <h1 id="login-title" className="flex h-10 items-center text-body font-bold">
          Sign in to the Global experiment
        </h1>
        <div className="mt-3 flex flex-col gap-2">
          <Field icon="alternate_email">
            <input
              aria-label="Email address"
              placeholder="Email address"
              type="email"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="h-full min-w-0 flex-1 bg-transparent text-body text-text-primary outline-none placeholder:text-text-muted"
            />
          </Field>
          <Field icon="lock">
            <input
              aria-label="Password"
              placeholder="Password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="h-full min-w-0 flex-1 bg-transparent text-body text-text-primary outline-none placeholder:text-text-muted"
            />
            {/* Figma draws one eye glyph; the pressed state shows as white instead of muted. */}
            <button
              type="button"
              aria-label="Show password"
              aria-pressed={showPassword}
              onClick={() => setShowPassword((value) => !value)}
              className={`flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-control ${showPassword ? "text-text-primary" : "text-text-muted"} ${focusRing}`}
            >
              <AdminIcon name="visibility" />
            </button>
          </Field>
          {error ? (
            <p id="login-error" role="alert" className="px-2 text-body text-text-primary">
              {error}
            </p>
          ) : null}
          {notice ? (
            <p id="login-notice" role="status" className="px-2 text-body text-text-muted">
              {notice}
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setError(null);
                setNotice("Password resets aren't available yet. Please contact the administrator to reset your password.");
              }}
              className={`flex h-10 cursor-pointer items-center gap-2 rounded-control px-2 text-body font-bold whitespace-nowrap ring-1 ring-line ${focusRing}`}
            >
              <AdminIcon name="lock_reset" />
              Forgot password?
            </button>
            <button
              type="submit"
              disabled={pending}
              className={`flex h-10 cursor-pointer items-center gap-2 rounded-control bg-inverse-surface px-2 text-body font-bold whitespace-nowrap text-inverse-content disabled:cursor-wait disabled:opacity-70 ${focusRing}`}
            >
              <AdminIcon name="login" />
              {pending ? "Signing in…" : "Sign in"}
            </button>
          </div>
        </div>
      </form>
    </main>
  );
}

function Field({ icon, children }: { icon: AdminIconName; children: React.ReactNode }) {
  return (
    <div className="flex h-10 items-center gap-1 rounded-control pr-1 pl-2 ring-1 ring-line focus-within:ring-text-primary">
      <AdminIcon name={icon} className="text-text-muted" />
      {children}
    </div>
  );
}
