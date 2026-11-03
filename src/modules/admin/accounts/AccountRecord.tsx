"use client";

import { useState } from "react";
import { adminApi, AdminApiError } from "../api/client";
import { NO_ROLE_LABEL, ROLE_OPTIONS, type Account, type OneTimeLink } from "../api/types";
import { useAdminData } from "../api/useAdminData";
import { ExpertiseField } from "../expertise/ExpertiseField";
import { linkedExpertiseOption } from "../expertise/expertiseOptions";
import { RecordPage } from "../record/RecordPage";
import { LIMIT_HINTS } from "../relationLimits";
import { GrantChips } from "../services/accessDisplay";
import { useAdmin, useCan } from "../session";
import { AccountAvatar } from "../ui/AccountAvatar";
import { AdminButton, StatusMessage } from "../ui/controls";
import { AutoGrowTextarea, formatPanelDate, PanelButton, Pills, PropertyRow, ReadOnlyValue } from "../ui/RecordForm";
import type { RelationOption } from "../ui/RelationPicker";
import { useToast } from "../ui/Toast";
import { STATUS_LABEL } from "./AccountsList";
import { OneTimeLinkBox } from "./OneTimeLink";

interface Draft {
  /** "" = no role yet (OPS-141). */
  role: string;
  description: string;
  expertise: RelationOption[];
}

const toDraft = (account: Account): Draft => ({
  role: account.role?.key ?? "",
  description: account.description ?? "",
  expertise: account.expertise.map(linkedExpertiseOption),
});

function patchFor(base: Draft, draft: Draft): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (draft.role !== base.role && draft.role) patch.role = draft.role;
  if (draft.description.trim() !== base.description.trim()) patch.description = draft.description.trim() || null;
  const ids = (options: RelationOption[]) => options.map((option) => option.id).join();
  if (ids(draft.expertise) !== ids(base.expertise)) patch.expertiseIds = draft.expertise.map((option) => option.id);
  return patch;
}

const pendingText = (pending: NonNullable<Account["pendingLink"]>) =>
  `${pending.purpose === "invite" ? "Invitation link" : "Password reset link"} waiting, valid until ${formatPanelDate(pending.expiresAt)}.`;

/**
 * /admin/accounts/[id] — an admin account, opened from Accounts (p15): its
 * profile — picture, name, description (OPS-144), expertise (OPS-135) —
 * role, email, status, service access, Account ID. A Rootadmin
 * (accounts.manage) gives it a role (an account made from an invitation
 * link has none, OPS-141), edits its description and expertise, makes a
 * password reset link (shown once), and deactivates or reactivates it —
 * never the last active Rootadmin. No note (OPS-142), no People link
 * (OPS-136): People is the CRM, accounts are the experiment's participants.
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
        <PanelButton
          icon={loaded.status === "deactivated" ? "restart_alt" : "close"}
          onClick={() => void setActive(loaded.status === "deactivated")}
          disabled={dirty || busy !== null}
        >
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
      <PropertyRow
        icon="select"
        label="Role"
        hint={
          loaded.id === me.id && canManage
            ? "Change your own role from another Rootadmin's account."
            : !loaded.role
              ? "No rights until a Rootadmin gives a role."
              : undefined
        }
      >
        {loaded.id === me.id || !canManage ? (
          <ReadOnlyValue>{loaded.role?.label ?? NO_ROLE_LABEL}</ReadOnlyValue>
        ) : (
          <Pills
            label="Role"
            options={ROLE_OPTIONS.map((option) => ({ value: option.key, label: option.label }))}
            value={draft.role}
            onChange={(value) => set("role", value)}
          />
        )}
      </PropertyRow>
      <PropertyRow icon="title" label="Description" htmlFor="account-description">
        {canManage ? (
          <AutoGrowTextarea
            id="account-description"
            value={draft.description}
            onChange={(e) => set("description", e.target.value)}
            maxLength={5000}
            placeholder="Add a description"
          />
        ) : (
          <ReadOnlyValue>{loaded.description ?? <span className="text-text-muted">No description.</span>}</ReadOnlyValue>
        )}
      </PropertyRow>
      <PropertyRow icon="expertise" label="Expertise">
        {canManage ? (
          <ExpertiseField selected={draft.expertise} onChange={(next) => set("expertise", next)} limitMessage={LIMIT_HINTS.accountExpertise} />
        ) : (
          <ReadOnlyValue>
            {loaded.expertise.length > 0 ? loaded.expertise.map((item) => item.name).join(", ") : <span className="text-text-muted">No expertise.</span>}
          </ReadOnlyValue>
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
