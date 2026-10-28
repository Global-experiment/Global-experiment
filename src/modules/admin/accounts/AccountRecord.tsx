"use client";

import { useState } from "react";
import { adminApi, AdminApiError } from "../api/client";
import { ROLE_OPTIONS, type Account, type OneTimeLink, type Page, type Person } from "../api/types";
import { useAdminData } from "../api/useAdminData";
import { RecordPage } from "../record/RecordPage";
import { GrantChips } from "../services/accessDisplay";
import { useAdmin, useCan } from "../session";
import { AccountAvatar } from "../ui/AccountAvatar";
import { AdminButton, StatusMessage } from "../ui/controls";
import { AutoGrowTextarea, formatPanelDate, PanelButton, Pills, PropertyRow, ReadOnlyValue } from "../ui/RecordForm";
import { RelationPicker, type RelationOption } from "../ui/RelationPicker";
import { useToast } from "../ui/Toast";
import { STATUS_LABEL } from "./AccountsList";
import { OneTimeLinkBox } from "./OneTimeLink";

interface Draft {
  role: string;
  note: string;
  person: RelationOption[];
}

const toDraft = (account: Account): Draft => ({
  role: account.role.key,
  note: account.note ?? "",
  person: account.person ? [{ id: account.person.id, label: account.person.name, href: `/admin/people/${account.person.id}` }] : [],
});

function patchFor(base: Draft, draft: Draft): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (draft.role !== base.role) patch.role = draft.role;
  if (draft.note.trim() !== base.note.trim()) patch.note = draft.note.trim() || null;
  const person = draft.person[0]?.id ?? null;
  if (person !== (base.person[0]?.id ?? null)) patch.personId = person;
  return patch;
}

async function searchPeople(text: string, signal: AbortSignal): Promise<RelationOption[]> {
  const query = new URLSearchParams({ pageSize: "20", sort: "name:asc" });
  if (text.trim()) query.set("search", text.trim());
  return (await adminApi<Page<Person>>(`/people?${query}`, { signal })).items.map((person) => ({ id: person.id, label: person.name, href: `/admin/people/${person.id}` }));
}

const pendingText = (pending: NonNullable<Account["pendingLink"]>) =>
  `${pending.purpose === "invite" ? "Invitation link" : "Password reset link"} waiting, valid until ${formatPanelDate(pending.expiresAt)}.`;

/**
 * /admin/accounts/[id] — an admin account, opened from Accounts (p15). A
 * view-only profile: picture, name, role, email, status, Account ID, the
 * linked person (and through them, expertise) and service access. A role
 * with accounts.manage also changes the role, note and person, makes a new
 * invitation or password reset link (shown once), and deactivates or
 * reactivates the account — never the last active Rootadmin.
 */
export function AccountRecord({ id }: { id: string }) {
  const toast = useToast();
  const me = useAdmin();
  const canManage = useCan("accounts.manage");
  const account = useAdminData<Account>(`/accounts/${id}`);
  const [edit, setEdit] = useState<{ version: string; draft: Draft } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<OneTimeLink | null>(null);

  if (account.error || !account.data) {
    return (
      <RecordPage backHref="/admin/accounts" backLabel="Accounts" title="">
        {account.error ? (
          <div>
            <StatusMessage tone="error">{account.error.status === 404 ? "This account doesn’t exist." : account.error.message}</StatusMessage>
            {account.error.status !== 404 ? <AdminButton onClick={account.reload}>Retry</AdminButton> : null}
          </div>
        ) : (
          <StatusMessage>Loading account…</StatusMessage>
        )}
      </RecordPage>
    );
  }

  const loaded = account.data;
  const version = `${loaded.id}@${loaded.updatedAt}`;
  const base = toDraft(loaded);
  const draft = edit?.version === version ? edit.draft : base;
  const patch = patchFor(base, draft);
  const dirty = Object.keys(patch).length > 0;
  const set = <Key extends keyof Draft>(key: Key, value: Draft[Key]) => setEdit({ version, draft: { ...draft, [key]: value } });
  const failure = (caught: unknown, fallback: string) => setError(caught instanceof AdminApiError ? (caught.issues[0]?.message ?? caught.message) : fallback);

  async function submit(): Promise<boolean> {
    setBusy("saving");
    setError(null);
    try {
      await adminApi(`/accounts/${id}`, { method: "PATCH", body: patch });
      toast("Account updated");
      return true;
    } catch (caught) {
      failure(caught, "Couldn't save.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function newLink() {
    setBusy("link");
    setError(null);
    try {
      setLink(await adminApi<OneTimeLink>(`/accounts/${id}/link`, { method: "POST" }));
      account.reload();
    } catch (caught) {
      failure(caught, "Couldn't create the link.");
    } finally {
      setBusy(null);
    }
  }

  async function setActive(active: boolean) {
    if (!active && !window.confirm(`Deactivate ${loaded.name}? They're signed out everywhere and can't sign in until reactivated.`)) return;
    setBusy(active ? "reactivating" : "deactivating");
    setError(null);
    try {
      await adminApi(`/accounts/${id}/${active ? "reactivate" : "deactivate"}`, { method: "POST" });
      toast(active ? "Account reactivated" : "Account deactivated");
      account.reload();
    } catch (caught) {
      failure(caught, "Couldn't change the account.");
    } finally {
      setBusy(null);
    }
  }

  const manageButtons =
    canManage && loaded.id !== me.id ? (
      <>
        {loaded.status !== "deactivated" ? (
          <PanelButton icon="link" onClick={() => void newLink()} disabled={dirty || busy !== null}>
            {busy === "link" ? "Creating…" : loaded.status === "invited" ? "New invitation link" : "New password reset link"}
          </PanelButton>
        ) : null}
        <PanelButton icon={loaded.status === "deactivated" ? "restart_alt" : "close"} onClick={() => void setActive(loaded.status === "deactivated")} disabled={dirty || busy !== null}>
          {loaded.status === "deactivated" ? "Reactivate account" : "Deactivate account"}
        </PanelButton>
      </>
    ) : null;

  return (
    <RecordPage
      backHref="/admin/accounts"
      backLabel="Accounts"
      title={loaded.name}
      entity={{ type: "admin_user", id }}
      entityNoun="account"
      readOnly={!canManage}
      revision={`${loaded.updatedAt}|${loaded.status}|${loaded.pendingLink?.expiresAt ?? ""}`}
      panelExtra={manageButtons}
      actions={{
        submit,
        discard: () => {
          setEdit(null);
          setError(null);
        },
        savedMessage: "Account updated",
        dirty,
        busy,
      }}
    >
      {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}
      {link ? <OneTimeLinkBox link={link} name={loaded.name} /> : null}
      <PropertyRow icon="title" label="Display name">
        <ReadOnlyValue>{loaded.displayName ?? loaded.name}</ReadOnlyValue>
      </PropertyRow>
      <PropertyRow icon="image" label="Profile picture">
        <div className="flex h-8 items-center">
          <AccountAvatar id={loaded.id} hasPicture={loaded.hasPicture} size={32} />
          {loaded.hasPicture ? null : <span className="ml-2 text-body text-text-muted">None</span>}
        </div>
      </PropertyRow>
      <PropertyRow icon="select" label="Role" hint={loaded.id === me.id && canManage ? "Change your own role from another Rootadmin's account." : undefined}>
        {loaded.id === me.id ? (
          <ReadOnlyValue>{loaded.role.label}</ReadOnlyValue>
        ) : (
          <Pills label="Role" options={ROLE_OPTIONS.map((option) => ({ value: option.key, label: option.label }))} value={draft.role} onChange={(value) => set("role", value)} />
        )}
      </PropertyRow>
      <PropertyRow icon="alternate_email" label="Email">
        <ReadOnlyValue>{loaded.email}</ReadOnlyValue>
      </PropertyRow>
      <PropertyRow icon="select" label="Status">
        <ReadOnlyValue>
          {STATUS_LABEL[loaded.status]}
          {loaded.pendingLink ? <span className="block text-meta text-text-muted">{pendingText(loaded.pendingLink)}</span> : null}
        </ReadOnlyValue>
      </PropertyRow>
      <PropertyRow icon="title" label="Note" htmlFor="account-note">
        <AutoGrowTextarea id="account-note" value={draft.note} onChange={(e) => set("note", e.target.value)} maxLength={2000} placeholder="Their part in the experiment" />
      </PropertyRow>
      <PropertyRow icon="arrow_outward" label="Person">
        <RelationPicker label="Person" selected={draft.person} onChange={(next) => set("person", next.slice(-1))} search={searchPeople} max={1} limitMessage="One person per account." />
      </PropertyRow>
      <PropertyRow icon="arrow_outward" label="Expertise">
        <ReadOnlyValue>{loaded.expertise.length > 0 ? loaded.expertise.map((item) => item.name).join(", ") : <span className="text-text-muted">From the linked person.</span>}</ReadOnlyValue>
      </PropertyRow>
      <PropertyRow icon="arrow_outward" label="Service access">
        <GrantChips grants={loaded.permissions} empty="No service access." />
      </PropertyRow>
      <PropertyRow icon="title" label="Account ID">
        <ReadOnlyValue>{loaded.accountId}</ReadOnlyValue>
      </PropertyRow>
      <PropertyRow icon="schedule" label="Last sign-in">
        <ReadOnlyValue>{loaded.lastLoginAt ? formatPanelDate(loaded.lastLoginAt) : <span className="text-text-muted">Never</span>}</ReadOnlyValue>
      </PropertyRow>
    </RecordPage>
  );
}
