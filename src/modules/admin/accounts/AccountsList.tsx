"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Highlight } from "@/shared/ui/Highlight";
import { adminApi, AdminApiError } from "../api/client";
import { ROLE_OPTIONS, type Account, type OneTimeLink, type Page, type Person } from "../api/types";
import { formatDate } from "../people/peopleTable";
import { grantLines } from "../services/accessDisplay";
import { useCan } from "../session";
import { AdminListPage } from "../table/AdminListPage";
import type { TableColumn } from "../table/DataTable";
import type { ListField } from "../table/fields";
import type { SortRule } from "../table/listState";
import { SavedViews, type SavedView } from "../table/SavedViews";
import { AdminButton } from "../ui/controls";
import { Pills, recordInput } from "../ui/RecordForm";
import { RelationPicker, type RelationOption } from "../ui/RelationPicker";
import { OneTimeLinkBox } from "./OneTimeLink";

const DEFAULT_SORT: SortRule[] = [{ field: "name", direction: "asc" }];

const text = (value: string | null, search: string): ReactNode => (value ? <Highlight text={value} query={search} /> : null);

export const STATUS_LABEL: Record<Account["status"], string> = { active: "Active", invited: "Invited", deactivated: "Deactivated" };

/** admin-desktop.pdf p15, measured: Name 164, Role 130, Email 168, Note 336, Expertise 226, Permissions 164. */
const COLUMNS: TableColumn<Account>[] = [
  { id: "name", label: "Name", icon: "title", width: 164, render: (row, s) => text(row.name, s) },
  { id: "role", label: "Role", icon: "select", width: 130, render: (row) => row.role.label },
  { id: "email", label: "Email", icon: "alternate_email", width: 168, render: (row, s) => text(row.email, s) },
  { id: "note", label: "Note", icon: "title", width: 336, render: (row, s) => text(row.note, s) },
  {
    id: "expertise",
    label: "Expertise",
    icon: "arrow_outward",
    width: 226,
    render: (row, s) =>
      row.expertise.map((item) => (
        <span key={item.id} className="block">
          <Highlight text={item.name} query={s} />
        </span>
      )),
  },
  { id: "permissions", label: "Permissions", icon: "arrow_outward", width: 164, render: (row, s) => grantLines(row.permissions, s, "service") },
  { id: "status", label: "Status", icon: "select", width: 120, defaultHidden: true, render: (row) => STATUS_LABEL[row.status] },
  { id: "number", label: "Account ID", icon: "title", width: 110, defaultHidden: true, render: (row) => row.accountId },
  { id: "last_login", label: "Last sign-in", icon: "schedule", width: 120, defaultHidden: true, render: (row) => (row.lastLoginAt ? formatDate(row.lastLoginAt) : null) },
];

const VIEWS: SavedView[] = [
  { id: "all", label: "All", filters: [] },
  { id: "active", label: "Active", filters: [{ field: "status", operator: "is", value: "active" }] },
  { id: "invited", label: "Invited", filters: [{ field: "status", operator: "is", value: "invited" }] },
  { id: "deactivated", label: "Deactivated", filters: [{ field: "status", operator: "is", value: "deactivated" }] },
];

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

async function searchPeople(text: string, signal: AbortSignal): Promise<RelationOption[]> {
  const query = new URLSearchParams({ pageSize: "20", sort: "name:asc" });
  if (text.trim()) query.set("search", text.trim());
  return (await adminApi<Page<Person>>(`/people?${query}`, { signal })).items.map((person) => ({ id: person.id, label: person.name, href: `/admin/people/${person.id}` }));
}

/**
 * "New account" (p15): an invitation, not an account with a password. The
 * Rootadmin fills in who and which role, gets a one-time link (72 hours)
 * to copy and send privately — no email is sent yet — and the invitee
 * sets their own password on it.
 */
function NewAccountDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const titleId = useId();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState("");
  const [person, setPerson] = useState<RelationOption[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ account: Account; link: OneTimeLink } | null>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const problem = !EMAIL.test(email.trim()) ? "Enter the email address." : role === "" ? "Choose a role." : null;

  async function invite(event: React.FormEvent) {
    event.preventDefault();
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await adminApi<{ account: Account } & OneTimeLink>("/accounts", {
        method: "POST",
        body: { email: email.trim(), role, ...(displayName.trim() ? { displayName: displayName.trim() } : {}), personId: person[0]?.id ?? null, ...(note.trim() ? { note: note.trim() } : {}) },
      });
      setCreated({ account: result.account, link: { link: result.link, purpose: result.purpose, expiresAt: result.expiresAt } });
    } catch (caught) {
      setError(caught instanceof AdminApiError ? (caught.issues[0]?.message ?? caught.message) : "Couldn't create the invitation.");
    } finally {
      setBusy(false);
    }
  }

  const field = "flex flex-col gap-1";
  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onClose={() => {
        onClose();
        // The list reloads once the link has been seen (reloading earlier would close this dialog).
        if (created) onCreated();
      }}
      className="m-auto w-[520px] max-w-[calc(100vw-32px)] rounded-control border border-line bg-surface-base p-3 text-body text-text-primary backdrop:bg-black/60"
    >
      <h2 id={titleId} className="font-bold">
        New account
      </h2>
      {created ? (
        <div className="mt-3 flex flex-col gap-3">
          <OneTimeLinkBox link={created.link} name={created.account.name} />
          <p className="flex justify-end gap-2">
            <AdminButton onClick={() => router.push(`/admin/accounts/${created.account.id}`)}>Open the account</AdminButton>
            <AdminButton onClick={() => dialog.current?.close()}>Done</AdminButton>
          </p>
        </div>
      ) : (
        <form onSubmit={(event) => void invite(event)} noValidate className="mt-3 flex flex-col gap-3">
          <p className="text-text-muted">They get a one-time link to set their own password. Nothing is sent: you copy the link and send it to them.</p>
          <div className={field}>
            <label htmlFor="invite-email" className="text-text-muted">
              Email
            </label>
            <input id="invite-email" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={320} required autoComplete="off" spellCheck={false} className={recordInput} />
          </div>
          <div className={field}>
            <label htmlFor="invite-name" className="text-text-muted">
              Name
            </label>
            <input id="invite-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={80} autoComplete="off" placeholder="How the admin shows them" className={recordInput} />
          </div>
          <div className={field}>
            <span className="text-text-muted">Role</span>
            <Pills label="Role" options={ROLE_OPTIONS.map((option) => ({ value: option.key, label: option.label }))} value={role} onChange={setRole} />
          </div>
          <div className={field}>
            <span className="text-text-muted">Person</span>
            <RelationPicker label="Person" selected={person} onChange={(next) => setPerson(next.slice(-1))} search={searchPeople} max={1} limitMessage="One person per account." />
          </div>
          <div className={field}>
            <label htmlFor="invite-note" className="text-text-muted">
              Note
            </label>
            <input id="invite-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} autoComplete="off" placeholder="Their part in the experiment" className={recordInput} />
          </div>
          {error ? (
            <p role="alert" className="text-meta">
              {error}
            </p>
          ) : null}
          <p className="flex justify-end gap-2">
            <AdminButton onClick={() => dialog.current?.close()} disabled={busy}>
              Cancel
            </AdminButton>
            <AdminButton type="submit" icon="add" disabled={busy}>
              {busy ? "Creating…" : "Create the invitation link"}
            </AdminButton>
          </p>
        </form>
      )}
    </dialog>
  );
}

function NewAccountControl({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <AdminButton icon="add" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        New account
      </AdminButton>
      {open ? <NewAccountDialog onClose={() => setOpen(false)} onCreated={onCreated} /> : null}
    </>
  );
}

/** /admin/accounts — the people who can sign in to the admin (p15); each row opens the account. */
export function AccountsList() {
  const canManage = useCan("accounts.manage");
  const [version, setVersion] = useState(0);
  const fields = useMemo<ListField[]>(
    () => [
      { id: "name", label: "Name", icon: "title", operators: [], sort: "text" },
      { id: "role", label: "Role", icon: "select", operators: ["is", "is_not"], options: ROLE_OPTIONS.map((option) => ({ value: option.key, label: option.label })), sort: "text" },
      { id: "email", label: "Email", icon: "alternate_email", operators: [], sort: "text" },
      {
        id: "status",
        label: "Status",
        icon: "select",
        operators: ["is", "is_not"],
        options: Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label })),
        sort: "text",
      },
      { id: "number", label: "Account ID", icon: "title", operators: [], sort: "text" },
      { id: "lastLogin", label: "Last sign-in", icon: "schedule", operators: [], sort: "dates" },
      { id: "created", label: "Created", icon: "schedule", operators: [], sort: "dates" },
    ],
    [],
  );

  return (
    <AdminListPage<Account>
      // A new invitation shows in the list once its dialog closes.
      key={version}
      config={{
        title: "Accounts",
        noun: "accounts",
        tableId: "accounts",
        endpoint: "/accounts",
        defaultSort: DEFAULT_SORT,
        fields,
        columns: COLUMNS,
        recordHref: (row) => `/admin/accounts/${row.id}`,
        views: <SavedViews views={VIEWS} />,
        actions: canManage ? <NewAccountControl onCreated={() => setVersion((value) => value + 1)} /> : null,
      }}
    />
  );
}
