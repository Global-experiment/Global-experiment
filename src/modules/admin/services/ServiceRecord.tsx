"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { INVALID_LINK, isWebLink } from "@/shared/validation/webLink";
import { adminApi, AdminApiError } from "../api/client";
import type { RecordHistory, Service, ServicesOptions } from "../api/types";
import { useAdminData } from "../api/useAdminData";
import { RecordMeta } from "../record/RecordMeta";
import { RecordPage } from "../record/RecordPage";
import { useCan } from "../session";
import { AdminButton, AdminButtonLink, StatusMessage } from "../ui/controls";
import { AutoGrowTextarea, invalidProps, Pills, PropertyRow, recordInput } from "../ui/RecordForm";
import { RelationPicker, type RelationOption } from "../ui/RelationPicker";
import { useToast } from "../ui/Toast";
import { GrantChips } from "./accessDisplay";

interface Draft {
  name: string;
  statusKey: string;
  categoryKey: string;
  hostingModelKey: string;
  url: string;
  description: string;
  responsible: RelationOption[];
}

const toDraft = (service: Service): Draft => ({
  name: service.name,
  statusKey: service.status?.key ?? "",
  categoryKey: service.category?.key ?? "",
  hostingModelKey: service.hostingModel?.key ?? "",
  url: service.url ?? "",
  description: service.description ?? "",
  responsible: service.responsible ? [{ id: service.responsible.id, label: service.responsible.name, href: `/admin/accounts/${service.responsible.id}` }] : [],
});

function patchFor(base: Draft, draft: Draft): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (draft.name.trim() !== base.name.trim()) patch.name = draft.name;
  for (const field of ["statusKey", "categoryKey", "hostingModelKey"] as const) if (draft[field] !== base[field]) patch[field] = draft[field] || null;
  for (const field of ["url", "description"] as const) if (draft[field].trim() !== base[field].trim()) patch[field] = draft[field].trim() || null;
  const responsible = draft.responsible[0]?.id ?? null;
  if (responsible !== (base.responsible[0]?.id ?? null)) patch.responsibleAdminId = responsible;
  return patch;
}

export function serviceDraftErrors(draft: Pick<Draft, "name" | "url">): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!draft.name.trim()) errors.name = "Name is required.";
  if (draft.url.trim() && !isWebLink(draft.url)) errors.url = INVALID_LINK;
  return errors;
}

const pills = (entries: { key: string; label: string }[] | undefined) => (entries ?? []).map((entry) => ({ value: entry.key, label: entry.label }));

/**
 * /admin/services/[id] — a service (p16) on the standard record page:
 * fields, right panel, history. Its Permissions are the access grants
 * that name it; "Add a permission" opens a new one for this service. A
 * role without services.update sees it view-only.
 */
export function ServiceRecord({ id }: { id: string }) {
  const router = useRouter();
  const toast = useToast();
  const canUpdate = useCan("services.update");
  const canDelete = useCan("services.delete");
  const canGrant = useCan("access.create");
  const service = useAdminData<Service>(`/services/${id}`);
  const options = useAdminData<ServicesOptions>("/services/options");
  const history = useAdminData<RecordHistory>(`/history/service/${id}`);
  const [edit, setEdit] = useState<{ version: string; draft: Draft } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set());
  const touch = (key: string) => setTouched((previous) => (previous.has(key) ? previous : new Set(previous).add(key)));

  if (service.error || !service.data) {
    return (
      <RecordPage backHref="/admin/services" backLabel="Services" title="">
        {service.error ? (
          <div>
            <StatusMessage tone="error">{service.error.status === 404 ? "This service doesn’t exist." : service.error.message}</StatusMessage>
            {service.error.status !== 404 ? <AdminButton onClick={service.reload}>Retry</AdminButton> : null}
          </div>
        ) : (
          <StatusMessage>Loading service…</StatusMessage>
        )}
      </RecordPage>
    );
  }

  const loaded = service.data;
  const version = `${loaded.id}@${loaded.updatedAt}@${loaded.archivedAt}`;
  const base = toDraft(loaded);
  const draft = edit?.version === version ? edit.draft : base;
  const patch = patchFor(base, draft);
  const dirty = Object.keys(patch).length > 0;
  const set = <Key extends keyof Draft>(key: Key, value: Draft[Key]) => setEdit({ version, draft: { ...draft, [key]: value } });
  const found = serviceDraftErrors(draft);
  const fieldErrors = Object.fromEntries(Object.entries(found).filter(([key]) => touched.has(key)));

  async function submit(): Promise<boolean> {
    if (Object.keys(found).length > 0) {
      setTouched(new Set([...touched, ...Object.keys(found)]));
      setError("Some fields need attention.");
      return false;
    }
    setBusy("saving");
    setError(null);
    try {
      await adminApi(`/services/${id}`, { method: "PATCH", body: patch });
      toast("Service updated");
      return true;
    } catch (caught) {
      setError(caught instanceof AdminApiError ? (caught.issues[0]?.message ?? caught.message) : "Couldn't save.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function setArchived(archived: boolean) {
    setBusy(archived ? "archiving" : "restoring");
    setError(null);
    try {
      await adminApi(`/services/${id}/${archived ? "archive" : "restore"}`, { method: "POST" });
      toast(archived ? "Service archived" : "Service restored");
      service.reload();
    } catch (caught) {
      setError(caught instanceof AdminApiError ? caught.message : "Couldn't change the archive state.");
    } finally {
      setBusy(null);
    }
  }

  const accounts = options.data?.accounts ?? [];
  const searchAccounts = async (text: string): Promise<RelationOption[]> =>
    accounts
      .filter((account) => account.name.toLowerCase().includes(text.trim().toLowerCase()))
      .map((account) => ({ id: account.id, label: account.name, href: `/admin/accounts/${account.id}` }));

  return (
    <RecordPage
      backHref="/admin/services"
      backLabel="Services"
      title={draft.name}
      entity={{ type: "service", id }}
      entityNoun="service"
      recordLink={(other) => `/admin/services/${other}`}
      readOnly={!canUpdate}
      actions={{
        submit,
        discard: () => {
          setEdit(null);
          setError(null);
          setTouched(new Set());
        },
        archived: loaded.archivedAt !== null,
        setArchived,
        remove: canDelete
          ? {
              confirmText: loaded.name,
              run: async (confirm) => {
                await adminApi(`/services/${id}`, { method: "DELETE", body: { confirm } });
                toast("Service deleted");
                router.push("/admin/services");
              },
            }
          : undefined,
        savedMessage: "Service updated",
        dirty,
        busy,
      }}
    >
      {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}
      <PropertyRow icon="title" label="Name" htmlFor="service-name" error={fieldErrors.name}>
        <input
          id="service-name"
          value={draft.name}
          onChange={(e) => set("name", e.target.value)}
          onBlur={() => touch("name")}
          {...invalidProps("service-name", fieldErrors.name)}
          maxLength={200}
          required
          autoComplete="off"
          placeholder="Service name"
          className={recordInput}
        />
      </PropertyRow>
      <PropertyRow icon="select" label="Status">
        <Pills label="Status" allowEmpty options={pills(options.data?.statuses)} value={draft.statusKey} onChange={(value) => set("statusKey", value)} />
      </PropertyRow>
      <PropertyRow icon="select" label="Category">
        <Pills label="Category" allowEmpty options={pills(options.data?.categories)} value={draft.categoryKey} onChange={(value) => set("categoryKey", value)} />
      </PropertyRow>
      <PropertyRow icon="select" label="Hosting model">
        <Pills label="Hosting model" allowEmpty options={pills(options.data?.hostingModels)} value={draft.hostingModelKey} onChange={(value) => set("hostingModelKey", value)} />
      </PropertyRow>
      <PropertyRow icon="link" label="URL" htmlFor="service-url" error={fieldErrors.url}>
        <input
          id="service-url"
          inputMode="url"
          value={draft.url}
          onChange={(e) => set("url", e.target.value)}
          onBlur={() => touch("url")}
          {...invalidProps("service-url", fieldErrors.url)}
          autoComplete="off"
          spellCheck={false}
          placeholder="https://"
          className={recordInput}
        />
      </PropertyRow>
      <PropertyRow icon="title" label="Description" htmlFor="service-description">
        <AutoGrowTextarea id="service-description" value={draft.description} onChange={(e) => set("description", e.target.value)} maxLength={5000} placeholder="What it's used for…" />
      </PropertyRow>
      <PropertyRow icon="arrow_outward" label="Responsible account">
        <RelationPicker label="Responsible account" selected={draft.responsible} onChange={(next) => set("responsible", next.slice(-1))} search={searchAccounts} max={1} limitMessage="One responsible account." />
      </PropertyRow>
      <PropertyRow icon="arrow_outward" label="Permissions">
        <div className="flex flex-col items-start gap-2">
          <GrantChips grants={loaded.permissions} empty="No one has access yet." />
          {canGrant && !loaded.archivedAt ? (
            <AdminButtonLink href={`/admin/permissions/new?service=${id}`} icon="add">
              Add a permission
            </AdminButtonLink>
          ) : null}
        </div>
      </PropertyRow>
      <RecordMeta
        numberLabel="Service ID"
        number={String(loaded.serviceNumber)}
        updatedAt={loaded.updatedAt}
        createdAt={loaded.createdAt}
        lastEditedBy={history.data?.lastEditedBy?.label ?? null}
        createdBy={history.data?.createdBy?.label ?? null}
      />
    </RecordPage>
  );
}
