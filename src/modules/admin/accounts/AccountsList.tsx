"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Highlight } from "@/shared/ui/Highlight";
import { adminApi, AdminApiError } from "../api/client";
import { NO_ROLE_LABEL, ROLE_OPTIONS, type Account, type Invitation } from "../api/types";
import { useAdminData } from "../api/useAdminData";
import { formatDate } from "../people/peopleTable";
import { grantLines } from "../services/accessDisplay";
import { useCan } from "../session";
import { AdminListPage } from "../table/AdminListPage";
import type { TableColumn } from "../table/DataTable";
import type { ListField } from "../table/fields";
import type { SortRule } from "../table/listState";
import { SavedViews, type SavedView } from "../table/SavedViews";
import { AdminButton, StatusMessage } from "../ui/controls";
import { formatPanelDate } from "../ui/RecordForm";
import { OneTimeLinkBox } from "./OneTimeLink";

const DEFAULT_SORT: SortRule[] = [{ field: "name", direction: "asc" }];

const text = (value: string | null, search: string): ReactNode => (value ? <Highlight text={value} query={search} /> : null);

export const STATUS_LABEL: Record<Account["status"], string> = { active: "Active", invited: "Invited", deactivated: "Deactivated" };

/** admin-desktop.pdf p15, measured: Name 164, Role 130, Email 168, Description 336 (Figma's Note, OPS-142/144), Expertise 226, Permissions 164. */
const COLUMNS: TableColumn<Account>[] = [
  { id: "name", label: "Name", icon: "title", width: 164, render: (row, s) => text(row.name, s) },
  { id: "role", label: "Role", icon: "select", width: 130, render: (row) => row.role?.label ?? <span className="text-text-muted">{NO_ROLE_LABEL}</span> },
  { id: "email", label: "Email", icon: "alternate_email", width: 168, render: (row, s) => text(row.email, s) },
  { id: "description", label: "Description", icon: "title", width: 336, render: (row, s) => text(row.description, s) },
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
  {
    id: "last_login",
    label: "Last sign-in",
    icon: "schedule",
    width: 120,
    defaultHidden: true,
    render: (row) => (row.lastLoginAt ? formatDate(row.lastLoginAt) : null),
  },
];

const VIEWS: SavedView[] = [
  { id: "all", label: "All", filters: [] },
  { id: "active", label: "Active", filters: [{ field: "status", operator: "is", value: "active" }] },
  { id: "no_role", label: "No role", filters: [{ field: "role", operator: "is", value: "none" }] },
  { id: "deactivated", label: "Deactivated", filters: [{ field: "status", operator: "is", value: "deactivated" }] },
];

const failure = (caught: unknown, fallback: string) => (caught instanceof AdminApiError ? (caught.issues[0]?.message ?? caught.message) : fallback);

/** A modal of the Accounts page, open at once; Esc or a button of its dialog form closes it. */
function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onClose={onClose}
      className={`m-auto ${wide ? "w-[640px]" : "w-[520px]"} max-w-[calc(100vw-32px)] rounded-control border border-line bg-surface-base p-3 text-body text-text-primary backdrop:bg-black/60`}
    >
      <h2 id={titleId} className="font-bold">
        {title}
      </h2>
      {children}
    </dialog>
  );
}

/** The modal's closing button: a dialog form closes its dialog. */
const CloseButton = ({ children }: { children: ReactNode }) => (
  <form method="dialog" className="flex justify-end">
    <AdminButton type="submit">{children}</AdminButton>
  </form>
);

/**
 * "New invitation link" (OPS-141): no email, no role asked — opening the
 * modal makes the link. It is shown once, to copy and send privately (no
 * email is sent); whoever opens it makes their own account (email and
 * password) and lands on an empty profile, with no role until a Rootadmin
 * gives one. Single use, 7 days, revocable from "Invitation links".
 */
function NewInvitationDialog({ onClose }: { onClose: () => void }) {
  const [made, setMade] = useState<{ link: string; expiresAt: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  useEffect(() => {
    // Once, even when React's development checks run the effect twice: each call makes a link.
    if (started.current) return;
    started.current = true;
    adminApi<{ invitation: Invitation; link: string }>("/invitations", { method: "POST" })
      .then((result) => setMade({ link: result.link, expiresAt: result.invitation.expiresAt }))
      .catch((caught: unknown) => setError(failure(caught, "Couldn't make the invitation link.")));
  }, []);
  return (
    <Modal title="New invitation link" onClose={onClose}>
      <div className="mt-3 flex flex-col gap-3">
        {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}
        {made ? (
          <OneTimeLinkBox
            link={{ link: made.link, purpose: "invite", expiresAt: made.expiresAt }}
            title="Invitation link"
            note={`Shown only now. Whoever opens it creates their own account, once, until ${formatPanelDate(made.expiresAt)}. The account has no role until you give it one. Revoke it from Invitation links.`}
          />
        ) : error ? null : (
          <StatusMessage>Making the link…</StatusMessage>
        )}
        <CloseButton>Done</CloseButton>
      </div>
    </Modal>
  );
}

const INVITATION_STATUS: Record<Invitation["status"], string> = { pending: "Waiting", used: "Used", revoked: "Revoked", expired: "Expired" };

/** The invitation links: who made them, until when, the account made with each; pending ones can be revoked. */
function InvitationsDialog({ onClose }: { onClose: () => void }) {
  const invitations = useAdminData<Invitation[]>("/invitations");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function revoke(id: string) {
    setBusy(id);
    setError(null);
    try {
      await adminApi(`/invitations/${id}/revoke`, { method: "POST" });
      invitations.reload();
    } catch (caught) {
      setError(failure(caught, "Couldn't revoke the link."));
    } finally {
      setBusy(null);
    }
  }
  return (
    <Modal title="Invitation links" onClose={onClose} wide>
      <div className="mt-3 flex flex-col gap-3">
        {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}
        {!invitations.data ? (
          <StatusMessage>{invitations.error ? invitations.error.message : "Loading…"}</StatusMessage>
        ) : invitations.data.length === 0 ? (
          <p className="text-text-muted">No invitation link yet.</p>
        ) : (
          <ul aria-label="Invitation links" className="flex flex-col">
            {invitations.data.map((invitation) => (
              <li
                key={invitation.id}
                data-invitation={invitation.status}
                className="flex min-h-10 flex-wrap items-center gap-x-2 gap-y-1 border-b border-line py-1"
              >
                <span className="w-20 shrink-0 font-bold">{INVITATION_STATUS[invitation.status]}</span>
                <span className="min-w-0 flex-1 text-meta text-text-muted">
                  Made {formatPanelDate(invitation.createdAt)}
                  {invitation.createdBy ? ` by ${invitation.createdBy}` : ""}
                  {invitation.status === "pending" ? ` · valid until ${formatPanelDate(invitation.expiresAt)}` : ""}
                  {invitation.account ? (
                    <>
                      {" · "}
                      <a href={`/admin/accounts/${invitation.account.id}`} className="text-text-primary underline underline-offset-2">
                        {invitation.account.name}
                      </a>
                    </>
                  ) : null}
                </span>
                {invitation.status === "pending" ? (
                  <AdminButton
                    icon="close"
                    onClick={() => void revoke(invitation.id)}
                    disabled={busy !== null}
                    aria-label={`Revoke the link made ${formatPanelDate(invitation.createdAt)}`}
                  >
                    {busy === invitation.id ? "Revoking…" : "Revoke"}
                  </AdminButton>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <CloseButton>Close</CloseButton>
      </div>
    </Modal>
  );
}

function InvitationControls() {
  const [open, setOpen] = useState<"new" | "list" | null>(null);
  return (
    <>
      <AdminButton icon="link" aria-haspopup="dialog" onClick={() => setOpen("list")}>
        Invitation links
      </AdminButton>
      <AdminButton icon="add" aria-haspopup="dialog" onClick={() => setOpen("new")}>
        New invitation link
      </AdminButton>
      {open === "new" ? <NewInvitationDialog onClose={() => setOpen(null)} /> : null}
      {open === "list" ? <InvitationsDialog onClose={() => setOpen(null)} /> : null}
    </>
  );
}

/** /admin/accounts — the people who can sign in to the admin (p15); each row opens the account. */
export function AccountsList() {
  const canManage = useCan("accounts.manage");
  const fields = useMemo<ListField[]>(
    () => [
      { id: "name", label: "Name", icon: "title", operators: [], sort: "text" },
      {
        id: "role",
        label: "Role",
        icon: "select",
        operators: ["is", "is_not"],
        options: [...ROLE_OPTIONS.map((option) => ({ value: option.key, label: option.label })), { value: "none", label: NO_ROLE_LABEL }],
        sort: "text",
      },
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
        actions: canManage ? <InvitationControls /> : null,
      }}
    />
  );
}
