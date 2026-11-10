"use client";

import { useState } from "react";
import { FIELD_MESSAGES, isWebLink } from "@/shared/validation/fieldRules";
import { useFieldValidation } from "../ui/fieldValidation";
import { adminApi, AdminApiError } from "../api/client";
import type { RecordHistory, Service, ServicesOptions } from "../api/types";
import { useAdminData } from "../api/useAdminData";
import { RecordMeta } from "../record/RecordMeta";
import { RecordPage } from "../record/RecordPage";
import { useCan } from "../session";
import { AdminButton, AdminButtonLink, StatusMessage } from "../ui/controls";
import { AutoGrowTextarea, invalidProps, Pills, PropertyRow, recordInput } from "../ui/RecordForm";
import { RelationPicker } from "../ui/RelationPicker";
import { useToast } from "../ui/Toast";
import { GrantChips } from "./accessDisplay";

interface Draft {
  name: string;
  statusKey: string;
  /** Tags (OPS-149), in order. */
  categoryKeys: string[];
  hostingModelKey: string;
  url: string;
  description: string;
}

const toDraft = (service: Service): Draft => ({
  name: service.name,
  statusKey: service.status?.key ?? "",
  categoryKeys: service.categories.map((category) => category.key),
  hostingModelKey: service.hostingModel?.key ?? "",
  url: service.url ?? "",
  description: service.description ?? "",
});

function patchFor(base: Draft, draft: Draft): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (draft.name.trim() !== base.name.trim()) patch.name = draft.name;
  for (const field of ["statusKey", "hostingModelKey"] as const) if (draft[field] !== base[field]) patch[field] = draft[field] || null;
  if (draft.categoryKeys.join() !== base.categoryKeys.join()) patch.categoryKeys = draft.categoryKeys;
  for (const field of ["url", "description"] as const) if (draft[field].trim() !== base[field].trim()) patch[field] = draft[field].trim() || null;
  return patch;
}

/** The fields with a rule, in the form's order (the first invalid one gets the focus on submit). */
const CHECKED = ["name", "url"] as const;
type CheckedField = (typeof CHECKED)[number];

/** Field errors found before sending, with the API's own rules (fieldRules.ts); shown once a field is left. */
export function serviceDraftErrors(draft: Pick<Draft, CheckedField>): Partial<Record<CheckedField, string>> {
  const errors: Partial<Record<CheckedField, string>> = {};
  if (!draft.name.trim()) errors.name = "Name is required.";
  if (draft.url.trim() && !isWebLink(draft.url)) errors.url = FIELD_MESSAGES.link;
  return errors;
}

const pills = (entries: { key: string; label: string }[] | undefined) => (entries ?? []).map((entry) => ({ value: entry.key, label: entry.label }));

/**
 * /admin/services/[id] — a service (p16) on the standard record page:
 * fields, right panel, history. Its Permissions are the access grants
 * that name it; "Add a permission" opens a new one for this service —
 * who is in charge of it is its Owner permission (OPS-130). Category takes
 * several tags (OPS-149). Archived, never deleted (OPS-147). A role
 * without services.update sees it view-only.
 */
export function ServiceRecord({ id }: { id: string }) {
  const toast = useToast();
  const canUpdate = useCan("services.update");
  const canGrant = useCan("access.create");
  const service = useAdminData<Service>(`/services/${id}`);
  const options = useAdminData<ServicesOptions>("/services/options");
  const history = useAdminData<RecordHistory>(`/history/service/${id}`);
  const [edit, setEdit] = useState<{ version: string; draft: Draft } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const validation = useFieldValidation(CHECKED, (field) => `service-${field}`);
  const touch = validation.leave;

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
  const fieldErrors = validation.shown(found);

  async function submit(): Promise<boolean> {
    if (!validation.checkAll(found)) return false;
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

  const categories = options.data?.categories ?? [];

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
          validation.reset();
        },
        archived: loaded.archivedAt !== null,
        setArchived,
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
        <RelationPicker
          label="Category"
          reorderable
          selected={draft.categoryKeys.map((key) => ({ id: key, label: categories.find((category) => category.key === key)?.label ?? key }))}
          onChange={(next) =>
            set(
              "categoryKeys",
              next.map((option) => option.id),
            )
          }
          search={async (text) =>
            categories
              .filter((category) => category.label.toLowerCase().includes(text.trim().toLowerCase()))
              .map((category) => ({ id: category.key, label: category.label }))
          }
        />
      </PropertyRow>
      <PropertyRow icon="select" label="Hosting model">
        <Pills
          label="Hosting model"
          allowEmpty
          options={pills(options.data?.hostingModels)}
          value={draft.hostingModelKey}
          onChange={(value) => set("hostingModelKey", value)}
        />
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
        <AutoGrowTextarea
          id="service-description"
          value={draft.description}
          onChange={(e) => set("description", e.target.value)}
          maxLength={5000}
          placeholder="What it's used for…"
        />
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
