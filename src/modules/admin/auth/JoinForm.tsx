"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { adminApi, AdminApiError } from "../api/client";
import { AdminIcon } from "../ui/adminIcons";
import { focusRing } from "../ui/controls";
import { useFieldValidation } from "../ui/fieldValidation";
import { errorIdFor, FieldError, invalidProps } from "../ui/RecordForm";
import { FIELD_LIMITS, FIELD_MESSAGES, isEmail } from "@/shared/validation/fieldRules";
import { Field } from "./LoginForm";
import { PasswordChecklist } from "./PasswordChecklist";
import { passwordAccepted } from "./passwordRules";

type State = { status: "checking" } | { status: "invalid" } | { status: "ready"; token: string };

const INVALID = "This link has expired or was already used.";
/** The fields with a rule, in the form's order (the first invalid one gets the focus on submit; OPS-70). */
const JOIN_FIELDS = ["email", "password", "repeat"] as const;
type JoinField = (typeof JOIN_FIELDS)[number];

/**
 * /admin/join — an invitation link (OPS-141): whoever opens it makes their
 * own account, email and password, and lands signed in on their (empty)
 * profile. The account has no role until a Rootadmin gives it one. The
 * token travels in the URL's fragment — never in a request line, so it
 * stays out of logs — and leaves the address bar at once. Same card as
 * sign-in (admin-desktop.pdf p1).
 */
export function JoinForm() {
  const router = useRouter();
  const [state, setState] = useState<State>({ status: "checking" });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const rulesId = useId();
  const validation = useFieldValidation(JOIN_FIELDS, (field) => `join-${field}`);
  const errors: Partial<Record<JoinField, string>> = {};
  if (!email.trim()) errors.email = "Enter your email address.";
  else if (!isEmail(email)) errors.email = FIELD_MESSAGES.email;
  if (!passwordAccepted(password, { email: email.trim(), name: null })) errors.password = "Choose a password that meets every rule below.";
  if (repeat !== password) errors.repeat = "The two passwords differ.";
  const shown = validation.shown(errors);
  // Read once: the address bar loses it straight away, and an effect can run twice (React's development checks).
  const tokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (tokenRef.current === null) {
      tokenRef.current = window.location.hash.slice(1);
      window.history.replaceState(null, "", window.location.pathname);
    }
    const token = tokenRef.current;
    let cancelled = false;
    (async () => {
      if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return setState({ status: "invalid" });
      try {
        await adminApi("/auth/invitations/inspect", { method: "POST", body: { token } });
        if (!cancelled) setState({ status: "ready", token });
      } catch {
        if (!cancelled) setState({ status: "invalid" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (state.status !== "ready") return;
    if (!validation.checkAll(errors)) return;
    setPending(true);
    setError(null);
    try {
      await adminApi("/auth/invitations/accept", { method: "POST", body: { token: state.token, email: email.trim(), password } });
      // Signed in: the new account starts on its profile.
      router.replace("/admin/profile");
    } catch (caught) {
      setPending(false);
      if (caught instanceof AdminApiError && caught.status === 404) setState({ status: "invalid" });
      else if (caught instanceof AdminApiError && caught.status === 429) setError("Too many attempts. Please wait and try again.");
      else setError(caught instanceof AdminApiError ? (caught.issues[0]?.message ?? caught.message) : "Couldn't create the account.");
    }
  }

  const input = "h-full min-w-0 flex-1 bg-transparent text-body text-text-primary outline-none placeholder:text-text-muted";
  const primary = `flex h-10 cursor-pointer items-center justify-center gap-2 rounded-control bg-inverse-surface px-2 text-body font-bold whitespace-nowrap text-inverse-content disabled:cursor-wait disabled:opacity-70 ${focusRing}`;

  return (
    <main data-admin className="flex min-h-dvh items-center justify-center bg-surface-base px-4 font-normal text-text-primary">
      <div className="w-full max-w-[400px] rounded-lg px-2 pb-2 ring-1 ring-line">
        <h1 id="join-title" className="flex h-10 items-center text-body font-bold">
          Join the Global experiment
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
            <p className="px-2 text-body text-text-muted">Ask a Rootadmin for a new invitation link. Each link works once, for 7 days.</p>
            <Link href="/admin/login" className={primary}>
              <AdminIcon name="login" />
              Go to sign in
            </Link>
          </div>
        ) : null}
        {state.status === "ready" ? (
          <form onSubmit={(event) => void submit(event)} noValidate aria-labelledby="join-title" className="mt-3 flex flex-col gap-2">
            <p className="px-2 text-body text-text-muted">Create your account: your email and a password. You&rsquo;ll then fill in your profile.</p>
            <Field icon="alternate_email">
              <input
                id="join-email"
                aria-label="Email address"
                placeholder="Email address"
                type="email"
                inputMode="email"
                autoComplete="username"
                maxLength={FIELD_LIMITS.email}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                onBlur={() => validation.leave("email")}
                {...invalidProps("join-email", shown.email)}
                className={input}
              />
            </Field>
            <FieldError fieldId="join-email" message={shown.email} />
            <Field icon="lock">
              <input
                id="join-password"
                aria-label="Password"
                aria-invalid={shown.password ? true : undefined}
                aria-describedby={shown.password ? `${errorIdFor("join-password")} ${rulesId}` : rulesId}
                placeholder="Password"
                type={show ? "text" : "password"}
                autoComplete="new-password"
                maxLength={200}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                onBlur={() => validation.leave("password")}
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
            <FieldError fieldId="join-password" message={shown.password} />
            <div className="px-2">
              <PasswordChecklist id={rulesId} password={password} email={email.trim()} name={null} />
            </div>
            <Field icon="lock">
              <input
                id="join-repeat"
                aria-label="Repeat the password"
                placeholder="Repeat the password"
                type={show ? "text" : "password"}
                autoComplete="new-password"
                maxLength={200}
                value={repeat}
                onChange={(event) => setRepeat(event.target.value)}
                onBlur={() => validation.leave("repeat")}
                {...invalidProps("join-repeat", shown.repeat)}
                className={input}
              />
            </Field>
            <FieldError fieldId="join-repeat" message={shown.repeat} />
            {error ? (
              <p role="alert" className="px-2 text-body">
                {error}
              </p>
            ) : null}
            <button type="submit" disabled={pending} className={primary}>
              <AdminIcon name="check_circle" />
              {pending ? "Creating…" : "Create my account"}
            </button>
          </form>
        ) : null}
      </div>
    </main>
  );
}
