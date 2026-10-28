"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { adminApi, AdminApiError } from "../api/client";
import type { Grant, Page, Person, RecordHistory, Service, ServicesOptions } from "../api/types";
import { useAdminData } from "../api/useAdminData";
import { RecordMeta } from "../record/RecordMeta";
import { RecordPage } from "../record/RecordPage";
import { useCan } from "../session";
import { AdminButton, StatusMessage } from "../ui/controls";
import { AutoGrowTextarea, DateField, Pills, PropertyRow, recordInput } from "../ui/RecordForm";
import { RelationPicker, type RelationOption } from "../ui/RelationPicker";
import { useToast } from "../ui/Toast";

interface Draft {
  name: string;
  person: RelationOption[];
  account: RelationOption[];
  service: RelationOption[];
  levelKey: string;
  statusKey: string;
  resourceScope: string;
  grantedOn: string;
  expiresOn: string;
  revokedOn: string;
}

const EMPTY: Draft = { name: "", person: [], account: [], service: [], levelKey: "", statusKey: "", resourceScope: "", grantedOn: "", expiresOn: "", revokedOn: "" };

const personOption = (ref: { id: string; name: string }): RelationOption => ({ id: ref.id, label: ref.name, href: `/admin/people/${ref.id}` });
const accountOption = (ref: { id: string; name: string }): RelationOption => ({ id: ref.id, label: ref.name, href: `/admin/accounts/${ref.id}` });
const serviceOption = (ref: { id: string; name: string }): RelationOption => ({ id: ref.id, label: ref.name, href: `/admin/services/${ref.id}` });

const toDraft = (grant: Grant): Draft => ({
  name: grant.name ?? "",
  person: grant.person ? [personOption(grant.person)] : [],
  account: grant.account ? [accountOption(grant.account)] : [],
  service: [serviceOption(grant.service)],
  levelKey: grant.level?.key ?? "",
  statusKey: grant.status?.key ?? "",
  resourceScope: grant.resourceScope ?? "",
  grantedOn: grant.grantedOn ?? "",
  expiresOn: grant.expiresOn ?? "",
  revokedOn: grant.revokedOn ?? "",
});

const one = (options: RelationOption[]) => options[0]?.id ?? null;

/** The request body: every field (create), or what changed (update). */
function bodyFor(base: Draft | null, draft: Draft): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  const changed = <Key extends keyof Draft>(key: Key, same: (a: Draft[Key], b: Draft[Key]) => boolean) => base === null || !same(base[key], draft[key]);
  const text = (a: string, b: string) => a.trim() === b.trim();
  const ref = (a: RelationOption[], b: RelationOption[]) => one(a) === one(b);
  if (changed("name", text)) body.name = draft.name.trim() || null;
  if (changed("person", ref)) body.personId = one(draft.person);
  if (changed("account", ref)) body.adminUserId = one(draft.account);
  if (changed("service", ref) && one(draft.service)) body.serviceId = one(draft.service);
  if (changed("levelKey", Object.is)) body.levelKey = draft.levelKey || null;
  if (changed("statusKey", Object.is)) body.statusKey = draft.statusKey || null;
  if (changed("resourceScope", text)) body.resourceScope = draft.resourceScope.trim() || null;
  for (const day of ["grantedOn", "expiresOn", "revokedOn"] as const) if (changed(day, Object.is)) body[day] = draft[day] || null;
  if (base === null) for (const key of Object.keys(body)) if (body[key] === null) delete body[key];
  return body;
}

/** Field errors before sending (the API checks the same rules). */
export function grantDraftErrors(draft: Pick<Draft, "service" | "grantedOn" | "expiresOn" | "revokedOn">): Record<string, string> {
  const errors: Record<string, string> = {};
  if (draft.service.length === 0) errors.service = "Choose a service.";
  if (draft.grantedOn && draft.revokedOn && draft.revokedOn < draft.grantedOn) errors.revokedOn = "Revoked can't be before granted.";
  if (draft.grantedOn && draft.expiresOn && draft.expiresOn < draft.grantedOn) errors.expiresOn = "Expires can't be before granted.";
  return errors;
}

async function searchPeople(text: string, signal: AbortSignal): Promise<RelationOption[]> {
  const query = new URLSearchParams({ pageSize: "20", sort: "name:asc" });
  if (text.trim()) query.set("search", text.trim());
  return (await adminApi<Page<Person>>(`/people?${query}`, { signal })).items.map(personOption);
}

async function searchServices(text: string, signal: AbortSignal): Promise<RelationOption[]> {
  const query = new URLSearchParams({ pageSize: "20", sort: "name:asc" });
  if (text.trim()) query.set("search", text.trim());
  return (await adminApi<Page<Service>>(`/services?${query}`, { signal })).items.map(serviceOption);
}

const pills = (entries: { key: string; label: string }[] | undefined) => (entries ?? []).map((entry) => ({ value: entry.key, label: entry.label }));

/**
 * /admin/permissions/[id] — one access grant (p17): who (a person, and
 * their admin account if they have one), which service, at what level,
 * its status and scope, and when it was granted, expires or was revoked.
 * Every change shows in the history here and — as granted, changed or
 * revoked access — on the person, the account and the service.
 * /admin/permissions/new creates one (prefilled with ?service= or ?person=).
 */
export function GrantRecord({ id }: { id: string }) {
  if (id === "new") return <NewGrantRecord />;
  return <ExistingGrantRecord id={id} />;
}

function GrantFields({
  draft,
  set,
  errors,
  options,
}: {
  draft: Draft;
  set: <Key extends keyof Draft>(key: Key, value: Draft[Key]) => void;
  errors: Record<string, string>;
  options: ServicesOptions | undefined;
}) {
  const accounts = options?.accounts ?? [];
  const searchAccounts = async (text: string): Promise<RelationOption[]> =>
    accounts.filter((account) => account.name.toLowerCase().includes(text.trim().toLowerCase())).map(accountOption);
  const automatic = draft.service[0] ? `${draft.service[0].label}${draft.levelKey ? ` / ${draft.levelKey}` : ""}` : "Service / level";
  return (
    <>
      <PropertyRow icon="title" label="Name" htmlFor="grant-name" hint="Empty: the service and the level.">
        <input id="grant-name" value={draft.name} onChange={(e) => set("name", e.target.value)} maxLength={200} autoComplete="off" placeholder={automatic} className={recordInput} />
      </PropertyRow>
      <PropertyRow icon="arrow_outward" label="Person">
        <RelationPicker label="Person" selected={draft.person} onChange={(next) => set("person", next.slice(-1))} search={searchPeople} max={1} limitMessage="One person per permission." />
      </PropertyRow>
      <PropertyRow icon="arrow_outward" label="Account">
        <RelationPicker label="Account" selected={draft.account} onChange={(next) => set("account", next.slice(-1))} search={searchAccounts} max={1} limitMessage="One admin account per permission." />
      </PropertyRow>
      <PropertyRow icon="arrow_outward" label="Service" error={errors.service}>
        <RelationPicker label="Service" selected={draft.service} onChange={(next) => set("service", next.slice(-1))} search={searchServices} max={1} limitMessage="One service per permission." />
      </PropertyRow>
      <PropertyRow icon="select" label="Permission level">
        <Pills label="Permission level" allowEmpty options={pills(options?.levels)} value={draft.levelKey} onChange={(value) => set("levelKey", value)} />
      </PropertyRow>
      <PropertyRow icon="select" label="Status">
        <Pills label="Status" allowEmpty options={pills(options?.accessStatuses)} value={draft.statusKey} onChange={(value) => set("statusKey", value)} />
      </PropertyRow>
      <PropertyRow icon="title" label="Resource scope" htmlFor="grant-scope">
        <AutoGrowTextarea id="grant-scope" value={draft.resourceScope} onChange={(e) => set("resourceScope", e.target.value)} maxLength={1000} placeholder="Which organization, project or files…" />
      </PropertyRow>
      <PropertyRow icon="schedule" label="Granted" error={errors.grantedOn}>
        <DateField id="grant-granted" label="Granted" value={draft.grantedOn} onChange={(value) => set("grantedOn", value)} error={errors.grantedOn} />
      </PropertyRow>
      <PropertyRow icon="schedule" label="Expires" error={errors.expiresOn}>
        <DateField id="grant-expires" label="Expires" value={draft.expiresOn} onChange={(value) => set("expiresOn", value)} error={errors.expiresOn} />
      </PropertyRow>
      <PropertyRow icon="schedule" label="Revoked" error={errors.revokedOn}>
        <DateField id="grant-revoked" label="Revoked" value={draft.revokedOn} onChange={(value) => set("revokedOn", value)} error={errors.revokedOn} />
      </PropertyRow>
    </>
  );
}

const message = (caught: unknown, fallback: string) => (caught instanceof AdminApiError ? (caught.issues[0]?.message ?? caught.message) : fallback);

function NewGrantRecord() {
  const router = useRouter();
  const toast = useToast();
  const params = useSearchParams();
  const serviceId = params.get("service");
  const personId = params.get("person");
  const options = useAdminData<ServicesOptions>("/services/options");
  // The prefilled service or person, by their names.
  const service = useAdminData<Service>(serviceId ? `/services/${serviceId}` : null);
  const person = useAdminData<Person>(personId ? `/people/${personId}` : null);
  const [edited, setEdited] = useState<Draft | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);

  const draft: Draft = edited ?? { ...EMPTY, service: service.data ? [serviceOption(service.data)] : [], person: person.data ? [personOption(person.data)] : [] };
  const set = <Key extends keyof Draft>(key: Key, value: Draft[Key]) => setEdited({ ...draft, [key]: value });
  const found = grantDraftErrors(draft);
  const backHref = serviceId ? `/admin/services/${serviceId}` : personId ? `/admin/people/${personId}` : "/admin/permissions";

  async function submit(): Promise<boolean> {
    if (Object.keys(found).length > 0) {
      setTried(true);
      setError("Some fields need attention.");
      return false;
    }
    setBusy("saving");
    setError(null);
    try {
      const created = await adminApi<Grant>("/access-grants", { method: "POST", body: bodyFor(null, draft) });
      toast("Permission created");
      router.replace(`/admin/permissions/${created.id}`);
      return false; // Already on its way to the new record.
    } catch (caught) {
      setError(message(caught, "Couldn't create the permission."));
      setBusy(null);
      return false;
    }
  }

  return (
    <RecordPage
      backHref={backHref}
      backLabel={serviceId ? "Service" : personId ? "Person" : "Permissions"}
      title="New permission"
      actions={{ submit, discard: () => setEdited(null), savedMessage: "Permission created", dirty: draft.service.length > 0, busy }}
    >
      {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}
      <GrantFields draft={draft} set={set} errors={tried ? found : {}} options={options.data} />
    </RecordPage>
  );
}

function ExistingGrantRecord({ id }: { id: string }) {
  const router = useRouter();
  const toast = useToast();
  const canUpdate = useCan("access.update");
  const canDelete = useCan("access.delete");
  const grant = useAdminData<Grant>(`/access-grants/${id}`);
  const options = useAdminData<ServicesOptions>("/services/options");
  const history = useAdminData<RecordHistory>(`/history/access_grant/${id}`);
  const [edit, setEdit] = useState<{ version: string; draft: Draft } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (grant.error || !grant.data) {
    return (
      <RecordPage backHref="/admin/permissions" backLabel="Permissions" title="">
        {grant.error ? (
          <div>
            <StatusMessage tone="error">{grant.error.status === 404 ? "This permission doesn’t exist." : grant.error.message}</StatusMessage>
            {grant.error.status !== 404 ? <AdminButton onClick={grant.reload}>Retry</AdminButton> : null}
          </div>
        ) : (
          <StatusMessage>Loading permission…</StatusMessage>
        )}
      </RecordPage>
    );
  }

  const loaded = grant.data;
  const version = `${loaded.id}@${loaded.updatedAt}@${loaded.archivedAt}`;
  const base = toDraft(loaded);
  const draft = edit?.version === version ? edit.draft : base;
  const patch = bodyFor(base, draft);
  const dirty = Object.keys(patch).length > 0;
  const set = <Key extends keyof Draft>(key: Key, value: Draft[Key]) => setEdit({ version, draft: { ...draft, [key]: value } });
  const found = grantDraftErrors(draft);
  const number = `#${loaded.grantNumber}`;

  async function submit(): Promise<boolean> {
    if (Object.keys(found).length > 0) {
      setError("Some fields need attention.");
      return false;
    }
    setBusy("saving");
    setError(null);
    try {
      await adminApi(`/access-grants/${id}`, { method: "PATCH", body: patch });
      toast("Permission updated");
      return true;
    } catch (caught) {
      setError(message(caught, "Couldn't save."));
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function setArchived(archived: boolean) {
    setBusy(archived ? "archiving" : "restoring");
    setError(null);
    try {
      await adminApi(`/access-grants/${id}/${archived ? "archive" : "restore"}`, { method: "POST" });
      toast(archived ? "Permission archived" : "Permission restored");
      grant.reload();
    } catch (caught) {
      setError(message(caught, "Couldn't change the archive state."));
    } finally {
      setBusy(null);
    }
  }

  return (
    <RecordPage
      backHref="/admin/permissions"
      backLabel="Permissions"
      title={draft.name.trim() || loaded.title}
      entity={{ type: "access_grant", id }}
      entityNoun="permission"
      recordLink={(other) => `/admin/permissions/${other}`}
      readOnly={!canUpdate}
      actions={{
        submit,
        discard: () => {
          setEdit(null);
          setError(null);
        },
        archived: loaded.archivedAt !== null,
        setArchived,
        remove: canDelete
          ? {
              confirmText: number,
              run: async (confirm) => {
                await adminApi(`/access-grants/${id}`, { method: "DELETE", body: { confirm } });
                toast("Permission deleted");
                router.push("/admin/permissions");
              },
            }
          : undefined,
        savedMessage: "Permission updated",
        dirty,
        busy,
      }}
    >
      {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}
      <GrantFields draft={draft} set={set} errors={found} options={options.data} />
      <RecordMeta
        numberLabel="ID"
        number={number}
        updatedAt={loaded.updatedAt}
        createdAt={loaded.createdAt}
        lastEditedBy={history.data?.lastEditedBy?.label ?? null}
        createdBy={history.data?.createdBy?.label ?? null}
      />
    </RecordPage>
  );
}
