"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { applyAppearance, type Appearance } from "@/shared/ui/appearance";
import { adminApi, AdminApiError } from "../api/client";
import { adminDisplayName, type AdminPrincipal, type Profile } from "../api/types";
import { useAdminData } from "../api/useAdminData";
import { useLeaveGuard } from "../record/useLeaveGuard";
import { GrantChips } from "../services/accessDisplay";
import { useCan } from "../session";
import { AccountAvatar } from "../ui/AccountAvatar";
import { AdminIcon, type AdminIconName } from "../ui/adminIcons";
import { AdminButton, focusRing, StatusMessage } from "../ui/controls";
import { Pills, PropertyRow, ReadOnlyValue, recordInput, RecordLayout } from "../ui/RecordForm";
import { useToast } from "../ui/Toast";
import { PasswordChecklist } from "./PasswordChecklist";
import { passwordAccepted } from "./passwordRules";

const MAX_DISPLAY_NAME = 80;
const PICTURE_TYPES = ["image/png", "image/jpeg", "image/webp"];
const PICTURE_MAX_BYTES = 2 * 1024 * 1024;
const APPEARANCES: { value: Appearance; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

interface Draft {
  displayName: string;
  timeZone: string;
  appearance: Appearance;
}

const toDraft = (profile: Profile): Draft => ({ displayName: profile.displayName ?? "", timeZone: profile.timeZone ?? "", appearance: profile.appearance });

const failure = (caught: unknown, fallback: string) => (caught instanceof AdminApiError ? (caught.issues[0]?.message ?? caught.message) : fallback);

/** The IANA zones this browser knows, for the Time zone select. */
function useTimeZones(current: string): string[] {
  return useMemo(() => {
    let zones: string[] = [];
    try {
      zones = Intl.supportedValuesOf("timeZone");
    } catch {
      zones = [];
    }
    return current && !zones.includes(current) ? [current, ...zones] : zones;
  }, [current]);
}

/**
 * /admin/profile — Profile settings (admin-desktop.pdf p18), for every
 * role: display name, profile picture, time zone, appearance (System,
 * Light, Dark — previewed at once, kept on Save changes), email, the
 * read-only Account ID and the account's service access. The panel:
 * Save changes, then Discard changes, Change email, Change password,
 * Sign out and Deactivate account. Email, password and deactivation ask
 * for the current password.
 */
export function ProfileScreen({ admin }: { admin: AdminPrincipal }) {
  const router = useRouter();
  const toast = useToast();
  const profile = useAdminData<Profile>("/profile");
  const canSeeAccess = useCan("access.read");
  const [edit, setEdit] = useState<{ version: string; draft: Draft } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(true);
  const [dialog, setDialog] = useState<"email" | "password" | "deactivate" | null>(null);
  const [pictureVersion, setPictureVersion] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);

  const loaded = profile.data;
  const version = loaded ? `${loaded.id}@${loaded.updatedAt}` : "";
  const base = loaded ? toDraft(loaded) : null;
  const draft = edit?.version === version ? edit.draft : base;
  const zones = useTimeZones(draft?.timeZone ?? "");
  const dirty = !!base && !!draft && (draft.displayName.trim() !== base.displayName.trim() || draft.timeZone !== base.timeZone || draft.appearance !== base.appearance);
  const guard = useLeaveGuard(dirty);

  // The appearance previews as soon as it's picked; leaving with it unsaved puts the saved one back.
  const savedAppearance = useRef<Appearance | undefined>(undefined);
  const saved = base?.appearance;
  useEffect(() => {
    savedAppearance.current = saved;
  }, [saved]);
  const shownAppearance = draft?.appearance;
  useEffect(() => {
    if (shownAppearance) applyAppearance(shownAppearance);
  }, [shownAppearance]);
  useEffect(
    () => () => {
      if (savedAppearance.current) applyAppearance(savedAppearance.current);
    },
    [],
  );

  if (profile.error || !loaded || !draft || !base) {
    return (
      <RecordLayout backHref="/admin" backLabel="the admin" title="Profile settings">
        {profile.error ? <StatusMessage tone="error">{profile.error.message}</StatusMessage> : <StatusMessage>Loading your profile…</StatusMessage>}
      </RecordLayout>
    );
  }

  const set = <Key extends keyof Draft>(key: Key, value: Draft[Key]) => setEdit({ version, draft: { ...draft, [key]: value } });
  const discard = () => {
    setEdit(null);
    setError(null);
  };

  async function save(event?: React.FormEvent) {
    event?.preventDefault();
    if (!dirty || busy) return;
    setBusy("saving");
    setError(null);
    const body: Record<string, unknown> = {};
    if (draft!.displayName.trim() !== base!.displayName.trim()) body.displayName = draft!.displayName.trim() || null;
    if (draft!.timeZone !== base!.timeZone) body.timeZone = draft!.timeZone || null;
    if (draft!.appearance !== base!.appearance) body.appearance = draft!.appearance;
    try {
      await adminApi<Profile>("/profile", { method: "PATCH", body });
      guard.release();
      setEdit(null);
      profile.reload();
      toast("Profile updated");
      router.refresh(); // the user card, appearance and time zone come from the session (layout)
    } catch (caught) {
      setError(failure(caught, "Couldn't save."));
    } finally {
      setBusy(null);
    }
  }

  async function upload(file: File) {
    setError(null);
    if (!PICTURE_TYPES.includes(file.type)) return setError("Use a PNG, JPEG or WebP image.");
    if (file.size > PICTURE_MAX_BYTES) return setError("The picture can be at most 2 MB.");
    setBusy("picture");
    try {
      const form = new FormData();
      form.append("file", file);
      await adminApi<Profile>("/profile/picture", { method: "POST", body: form });
      setPictureVersion((value) => value + 1);
      profile.reload();
      toast("Profile picture updated");
      router.refresh();
    } catch (caught) {
      setError(failure(caught, "Couldn't upload the picture."));
    } finally {
      setBusy(null);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function removePicture() {
    setBusy("picture");
    setError(null);
    try {
      await adminApi<Profile>("/profile/picture", { method: "DELETE" });
      profile.reload();
      toast("Profile picture removed");
      router.refresh();
    } catch (caught) {
      setError(failure(caught, "Couldn't remove the picture."));
    } finally {
      setBusy(null);
    }
  }

  async function signOut() {
    setBusy("signing-out");
    try {
      await adminApi("/auth/logout", { method: "POST" });
      guard.release();
      router.replace("/admin/login");
    } catch {
      setBusy(null);
      setError("Couldn't sign out. Please try again.");
    }
  }

  const panel = (
    <div className="flex flex-col gap-2 pt-1">
      <button
        type="submit"
        form="profile-form"
        disabled={!dirty || busy !== null}
        className={`flex h-8 w-full cursor-pointer items-center rounded-control px-2 text-body font-bold text-text-primary ring-1 ring-line disabled:cursor-not-allowed disabled:text-text-muted ${focusRing}`}
      >
        {busy === "saving" ? "Saving…" : "Save changes"}
      </button>
      <div className="flex flex-col rounded-control ring-1 ring-line">
        <MenuRow icon={menuOpen ? "expand_less" : "expand_more"} onClick={() => setMenuOpen((open) => !open)} aria-expanded={menuOpen}>
          {menuOpen ? "Close" : "More options"}
        </MenuRow>
        {menuOpen ? (
          <>
            <MenuRow icon="restart_alt" onClick={discard} disabled={!dirty || busy !== null}>
              Discard changes
            </MenuRow>
            <MenuRow icon="alternate_email" onClick={() => setDialog("email")} disabled={busy !== null}>
              Change email
            </MenuRow>
            <MenuRow icon="lock_reset" onClick={() => setDialog("password")} disabled={busy !== null}>
              Change password
            </MenuRow>
            <MenuRow icon="logout" onClick={() => void signOut()} disabled={busy !== null}>
              {busy === "signing-out" ? "Signing out…" : "Sign out"}
            </MenuRow>
            <MenuRow icon="delete_forever" onClick={() => setDialog("deactivate")} disabled={busy !== null}>
              Deactivate account
            </MenuRow>
          </>
        ) : null}
      </div>
    </div>
  );

  return (
    <RecordLayout backHref="/admin" backLabel="the admin" title="Profile settings" panel={panel}>
      <form id="profile-form" onSubmit={(event) => void save(event)} noValidate className="flex flex-col gap-4">
        {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}
        <PropertyRow icon="title" label="Display name" htmlFor="profile-display-name">
          <input
            id="profile-display-name"
            value={draft.displayName}
            onChange={(event) => set("displayName", event.target.value)}
            maxLength={MAX_DISPLAY_NAME}
            autoComplete="name"
            placeholder={adminDisplayName({ email: loaded.email, displayName: null })}
            className={recordInput}
          />
        </PropertyRow>
        <PropertyRow icon="image" label="Profile picture">
          <div className="flex flex-wrap items-center gap-2">
            {loaded.hasPicture ? <AccountAvatar id={loaded.id} hasPicture size={32} version={`${loaded.updatedAt}-${pictureVersion}`} /> : null}
            <input
              ref={fileInput}
              id="profile-picture"
              type="file"
              accept={PICTURE_TYPES.join(",")}
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void upload(file);
              }}
            />
            <AdminButton icon="add" onClick={() => fileInput.current?.click()} disabled={busy !== null}>
              {busy === "picture" ? "Uploading…" : loaded.hasPicture ? "Replace the picture" : "Add a profile picture"}
            </AdminButton>
            {loaded.hasPicture ? (
              <AdminButton icon="close" onClick={() => void removePicture()} disabled={busy !== null}>
                Remove
              </AdminButton>
            ) : null}
            <span className="w-full text-meta text-text-muted">PNG, JPEG or WebP, up to 2 MB.</span>
          </div>
        </PropertyRow>
        <PropertyRow icon="select" label="Time zone" htmlFor="profile-time-zone">
          <span className="relative flex">
            <select
              id="profile-time-zone"
              value={draft.timeZone}
              onChange={(event) => set("timeZone", event.target.value)}
              className={`${recordInput} w-full cursor-pointer appearance-none pr-8 ring-1 ring-line`}
            >
              <option value="">Automatic (this device&rsquo;s time zone)</option>
              {zones.map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </select>
            <span aria-hidden="true" className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-text-muted">
              <AdminIcon name="arrow_drop_down" />
            </span>
          </span>
        </PropertyRow>
        <PropertyRow icon="select" label="Appearance">
          <Pills label="Appearance" options={APPEARANCES} value={draft.appearance} onChange={(value) => set("appearance", value as Appearance)} />
        </PropertyRow>
        <PropertyRow icon="alternate_email" label="Email">
          <ReadOnlyValue>{loaded.email}</ReadOnlyValue>
        </PropertyRow>
        <PropertyRow icon="title" label="Account ID">
          <ReadOnlyValue>{loaded.accountId}</ReadOnlyValue>
          <span className="text-meta text-text-primary">Read only.</span>
        </PropertyRow>
        <PropertyRow icon="arrow_outward" label="Service access">
          <GrantChips grants={loaded.permissions} format="list" link={canSeeAccess} empty="No service access." />
        </PropertyRow>
        <PropertyRow icon="lock" label="Role">
          <ReadOnlyValue>{admin.roleLabel}</ReadOnlyValue>
        </PropertyRow>
      </form>
      {dialog === "email" ? (
        <PasswordDialog
          title="Change email"
          action="Change email"
          onClose={() => setDialog(null)}
          extra={(value, setValue) => (
            <>
              <label htmlFor="new-email" className="text-text-muted">
                New email
              </label>
              <input id="new-email" type="email" inputMode="email" value={value} onChange={(e) => setValue(e.target.value)} maxLength={320} autoComplete="email" spellCheck={false} className={recordInput} />
            </>
          )}
          run={async (currentPassword, email) => {
            await adminApi<Profile>("/profile/email", { method: "POST", body: { currentPassword, email: email.trim() } });
            profile.reload();
            toast("Email changed");
            router.refresh();
          }}
        />
      ) : null}
      {dialog === "password" ? (
        <PasswordDialog
          title="Change password"
          action="Change password"
          onClose={() => setDialog(null)}
          newPassword={{ email: loaded.email, name: loaded.displayName }}
          run={async (currentPassword, newPassword) => {
            await adminApi("/profile/password", { method: "POST", body: { currentPassword, newPassword } });
            toast("Password changed — other sessions were signed out");
          }}
        />
      ) : null}
      {dialog === "deactivate" ? (
        <PasswordDialog
          title="Deactivate your account?"
          action="Deactivate account"
          intro={
            <>
              You&rsquo;ll be signed out everywhere and can&rsquo;t sign in again until a Rootadmin reactivates the account. Your history stays. The last active Rootadmin can&rsquo;t be deactivated.
            </>
          }
          onClose={() => setDialog(null)}
          run={async (currentPassword) => {
            await adminApi("/profile/deactivate", { method: "POST", body: { currentPassword } });
            guard.release();
            router.replace("/admin/login");
          }}
        />
      ) : null}
    </RecordLayout>
  );
}

/** A row of p18's panel menu: the glyph, then the bold label; rows share one ring, 1px rules between them. */
function MenuRow({ icon, children, ...rest }: { icon: AdminIconName; children: ReactNode } & Omit<React.ComponentProps<"button">, "children" | "type">) {
  return (
    <button
      type="button"
      className={`flex h-8 w-full cursor-pointer items-center gap-2 px-2 text-body font-bold text-text-primary not-first:shadow-[0_-1px_0_0_var(--color-line)] disabled:cursor-not-allowed disabled:text-text-muted ${focusRing}`}
      {...rest}
    >
      <AdminIcon name={icon} />
      {children}
    </button>
  );
}

/**
 * A dialog that asks for the current password, plus a new email
 * (`extra`) or a new password with its checklist (`newPassword`).
 */
function PasswordDialog({
  title,
  action,
  intro,
  extra,
  newPassword,
  onClose,
  run,
}: {
  title: string;
  action: string;
  intro?: ReactNode;
  extra?: (value: string, setValue: (value: string) => void) => ReactNode;
  newPassword?: { email: string; name: string | null };
  onClose: () => void;
  run: (currentPassword: string, value: string) => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const rulesId = useId();
  const [current, setCurrent] = useState("");
  const [value, setValue] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const ready =
    current.length > 0 &&
    (extra ? value.trim().length > 0 : true) &&
    (newPassword ? passwordAccepted(value, newPassword) && value === repeat : true);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      await run(current, value);
      dialog.current?.close();
    } catch (caught) {
      setError(failure(caught, "That didn't work. Please try again."));
      setBusy(false);
    }
  }

  return (
    <dialog ref={dialog} aria-labelledby={titleId} onClose={onClose} className="m-auto w-[440px] max-w-[calc(100vw-32px)] rounded-control border border-line bg-surface-base p-3 text-body text-text-primary backdrop:bg-black/60">
      <h2 id={titleId} className="font-bold">
        {title}
      </h2>
      <form onSubmit={(event) => void submit(event)} noValidate className="mt-3 flex flex-col gap-2">
        {intro ? <p className="text-text-muted">{intro}</p> : null}
        {extra?.(value, setValue)}
        {newPassword ? (
          <>
            <label htmlFor={`${titleId}-new`} className="text-text-muted">
              New password
            </label>
            <input id={`${titleId}-new`} type="password" value={value} onChange={(e) => setValue(e.target.value)} maxLength={200} autoComplete="new-password" aria-describedby={rulesId} className={recordInput} />
            <PasswordChecklist id={rulesId} password={value} email={newPassword.email} name={newPassword.name} />
            <label htmlFor={`${titleId}-repeat`} className="text-text-muted">
              Repeat the new password
            </label>
            <input id={`${titleId}-repeat`} type="password" value={repeat} onChange={(e) => setRepeat(e.target.value)} maxLength={200} autoComplete="new-password" className={recordInput} />
            {repeat && repeat !== value ? <p className="text-meta">The two passwords differ.</p> : null}
          </>
        ) : null}
        <label htmlFor={`${titleId}-current`} className="text-text-muted">
          Current password
        </label>
        <input id={`${titleId}-current`} type="password" value={current} onChange={(e) => setCurrent(e.target.value)} maxLength={200} autoComplete="current-password" className={recordInput} />
        {error ? (
          <p role="alert" className="text-meta">
            {error}
          </p>
        ) : null}
        <p className="mt-1 flex justify-end gap-2">
          <AdminButton onClick={() => dialog.current?.close()} disabled={busy}>
            Cancel
          </AdminButton>
          <AdminButton type="submit" disabled={!ready || busy}>
            {busy ? "Working…" : action}
          </AdminButton>
        </p>
      </form>
    </dialog>
  );
}
