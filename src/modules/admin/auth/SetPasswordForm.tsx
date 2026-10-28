"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { adminApi, AdminApiError } from "../api/client";
import { AdminIcon } from "../ui/adminIcons";
import { focusRing } from "../ui/controls";
import { Field } from "./LoginForm";
import { PasswordChecklist } from "./PasswordChecklist";
import { passwordAccepted } from "./passwordRules";

interface LinkInfo {
  purpose: "invite" | "reset";
  email: string;
  name: string;
  expiresAt: string;
}

type State =
  | { status: "checking" }
  | { status: "invalid" }
  | { status: "ready"; token: string; info: LinkInfo }
  | { status: "done"; purpose: LinkInfo["purpose"] };

const INVALID = "This link has expired or was already used.";

/**
 * /admin/welcome and /admin/reset-password (Delivery 2): the one-time link
 * a Rootadmin made. The token travels in the URL's fragment — never sent
 * to a server in a request line, so it stays out of logs — and is taken
 * out of the address bar at once. The invitee (or the admin who lost their
 * password) sets a password that meets the rules, then signs in as usual.
 * Same card as sign-in (admin-desktop.pdf p1).
 */
export function SetPasswordForm({ purpose }: { purpose: LinkInfo["purpose"] }) {
  const [state, setState] = useState<State>({ status: "checking" });
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const rulesId = useId();
  // Read once: the address bar loses it straight away, and an effect can run twice (React's development checks).
  const tokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (tokenRef.current === null) {
      tokenRef.current = window.location.hash.slice(1);
      // Out of the address bar (and the history entry) before anything else.
      window.history.replaceState(null, "", window.location.pathname);
    }
    const token = tokenRef.current;
    let cancelled = false;
    (async () => {
      if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return setState({ status: "invalid" });
      try {
        const info = await adminApi<LinkInfo>("/auth/tokens/inspect", { method: "POST", body: { token } });
        if (!cancelled) setState(info.purpose === purpose ? { status: "ready", token, info } : { status: "invalid" });
      } catch {
        if (!cancelled) setState({ status: "invalid" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [purpose]);

  const title = purpose === "invite" ? "Welcome to the Global experiment" : "Choose a new password";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (state.status !== "ready") return;
    if (!passwordAccepted(password, state.info)) return setError("The password doesn't meet the rules yet.");
    if (password !== repeat) return setError("The two passwords differ.");
    setPending(true);
    setError(null);
    try {
      await adminApi("/auth/tokens/accept", { method: "POST", body: { token: state.token, password } });
      setState({ status: "done", purpose });
    } catch (caught) {
      setPending(false);
      if (caught instanceof AdminApiError && caught.status === 404) setState({ status: "invalid" });
      else if (caught instanceof AdminApiError && caught.status === 429) setError("Too many attempts. Please wait and try again.");
      else setError(caught instanceof AdminApiError ? (caught.issues[0]?.message ?? caught.message) : "Couldn't set the password.");
    }
  }

  const input = "h-full min-w-0 flex-1 bg-transparent text-body text-text-primary outline-none placeholder:text-text-muted";
  const primary = `flex h-10 cursor-pointer items-center justify-center gap-2 rounded-control bg-inverse-surface px-2 text-body font-bold whitespace-nowrap text-inverse-content disabled:cursor-wait disabled:opacity-70 ${focusRing}`;

  return (
    <main data-admin className="flex min-h-dvh items-center justify-center bg-surface-base px-4 font-normal text-text-primary">
      <div className="w-full max-w-[400px] rounded-lg px-2 pb-2 ring-1 ring-line">
        <h1 id="set-password-title" className="flex h-10 items-center text-body font-bold">
          {title}
        </h1>
        {state.status === "checking" ? (
          <p role="status" className="mt-3 px-2 text-body text-text-muted">
            Checking the link…
          </p>
        ) : null}
        {state.status === "invalid" ? (
          <div className="mt-3 flex flex-col gap-2">
            <p role="alert" className="px-2 text-body">
              {INVALID}
            </p>
            <p className="px-2 text-body text-text-muted">Ask a Rootadmin for a new link. Each link works once, for 72 hours.</p>
            <Link href="/admin/login" className={primary}>
              <AdminIcon name="login" />
              Go to sign in
            </Link>
          </div>
        ) : null}
        {state.status === "done" ? (
          <div className="mt-3 flex flex-col gap-2">
            <p role="status" className="px-2 text-body">
              {state.purpose === "invite" ? "Your account is ready." : "Your password is changed."} Sign in with your email and the new password.
            </p>
            <Link href="/admin/login" className={primary}>
              <AdminIcon name="login" />
              Sign in
            </Link>
          </div>
        ) : null}
        {state.status === "ready" ? (
          <form onSubmit={(event) => void submit(event)} noValidate aria-labelledby="set-password-title" className="mt-3 flex flex-col gap-2">
            <p className="px-2 text-body text-text-muted">
              {purpose === "invite" ? `${state.info.name}, set the password for ${state.info.email}.` : `Set a new password for ${state.info.email}. You'll be signed out everywhere else.`}
            </p>
            {/* For password managers: the account this password belongs to. */}
            <input type="email" name="username" autoComplete="username" value={state.info.email} readOnly hidden />
            <Field icon="lock">
              <input
                aria-label="New password"
                aria-describedby={rulesId}
                placeholder="New password"
                type={show ? "text" : "password"}
                autoComplete="new-password"
                maxLength={200}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className={input}
              />
              <button
                type="button"
                aria-label="Show password"
                aria-pressed={show}
                onClick={() => setShow((value) => !value)}
                className={`flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-control ${show ? "text-text-primary" : "text-text-muted"} ${focusRing}`}
              >
                <AdminIcon name="visibility" />
              </button>
            </Field>
            <div className="px-2">
              <PasswordChecklist id={rulesId} password={password} email={state.info.email} name={state.info.name} />
            </div>
            <Field icon="lock">
              <input
                aria-label="Repeat the new password"
                placeholder="Repeat the new password"
                type={show ? "text" : "password"}
                autoComplete="new-password"
                maxLength={200}
                value={repeat}
                onChange={(event) => setRepeat(event.target.value)}
                className={input}
              />
            </Field>
            {error ? (
              <p role="alert" className="px-2 text-body">
                {error}
              </p>
            ) : null}
            <button type="submit" disabled={pending} className={primary}>
              <AdminIcon name="check_circle" />
              {pending ? "Saving…" : purpose === "invite" ? "Set my password" : "Change my password"}
            </button>
          </form>
        ) : null}
      </div>
    </main>
  );
}
