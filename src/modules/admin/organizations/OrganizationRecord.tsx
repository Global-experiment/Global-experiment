"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { adminApi, AdminApiError } from "../api/client";
import { formatOrgNumber, type Organization, type OrganizationInput, type Page, type Person, type RecordHistory } from "../api/types";
import { useAdminData } from "../api/useAdminData";
import { organizationMissing } from "../completeness";
import { ExpertiseField } from "../expertise/ExpertiseField";
import { linkedExpertiseOption } from "../expertise/expertiseOptions";
import { LIMIT_HINTS, RELATION_LIMITS } from "../relationLimits";
import { CompletenessRow } from "../ui/CompletenessRow";
import { RecordMeta } from "../record/RecordMeta";
import { RecordPage } from "../record/RecordPage";
import { AdminButton, StatusMessage } from "../ui/controls";
import { INVALID_LINK, isWebLink } from "@/shared/validation/webLink";
import { AutoGrowTextarea, invalidProps, PropertyRow, recordInput } from "../ui/RecordForm";
import { RelationPicker, type RelationOption } from "../ui/RelationPicker";
import { useCan } from "../session";
import { useToast } from "../ui/Toast";

interface Draft {
  name: string;
  description: string;
  website: string;
  email: string;
  wiseRecipientId: string;
  expertise: RelationOption[];
  people: RelationOption[];
}

const personOption = (person: { id: string; name: string }): RelationOption => ({
  id: person.id,
  label: person.name,
  href: `/admin/people/${person.id}`,
});

const toDraft = (organization: Organization): Draft => ({
  name: organization.name,
  description: organization.description ?? "",
  website: organization.website ?? "",
  email: organization.email ?? "",
  wiseRecipientId: organization.wiseRecipientId ?? "",
  expertise: organization.expertise.map(linkedExpertiseOption),
  people: organization.people.map(personOption),
});

function patchFor(base: Draft, draft: Draft): OrganizationInput {
  const patch: OrganizationInput = {};
  if (draft.name.trim() !== base.name.trim()) patch.name = draft.name;
  for (const field of ["description", "website", "email", "wiseRecipientId"] as const) {
    if (draft[field].trim() !== base[field].trim()) patch[field] = draft[field].trim() || null;
  }
  const ids = (options: RelationOption[]) => options.map((option) => option.id).sort().join(",");
  // Expertise keeps the order given (drag and drop): a new order is a change. People don't have one.
  const ordered = (options: RelationOption[]) => options.map((option) => option.id).join(",");
  if (ordered(draft.expertise) !== ordered(base.expertise)) patch.expertiseIds = draft.expertise.map((option) => option.id);
  // People travel in the same PATCH: one Submit, one history event.
  if (ids(draft.people) !== ids(base.people)) patch.personIds = draft.people.map((option) => option.id);
  return patch;
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Field errors found before sending (the API checks the same rules), shown once a field is left. */
export function organizationDraftErrors(draft: Pick<Draft, "name" | "email" | "website">): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!draft.name.trim()) errors.name = "Name is required.";
  if (draft.email.trim() && !EMAIL.test(draft.email.trim())) errors.email = "Invalid email address.";
  if (draft.website.trim() && !isWebLink(draft.website)) errors.website = INVALID_LINK;
  return errors;
}

/** People search for the People picker: someone already at 5 organizations can't be added here. */
async function searchPeople(text: string, signal: AbortSignal): Promise<RelationOption[]> {
  const query = new URLSearchParams({ pageSize: "20", sort: "name:asc" });
  if (text.trim()) query.set("search", text.trim());
  const page = await adminApi<Page<Person>>(`/people?${query}`, { signal });
  return page.items.map((person) => {
    const full = person.organizations.length >= RELATION_LIMITS.organizationsPerPerson;
    return {
      ...personOption(person),
      disabled: full,
      muted: full,
      disabledReason: full ? `Already in ${RELATION_LIMITS.organizationsPerPerson} organizations (the maximum)` : undefined,
    };
  });
}

/**
 * /admin/organizations/[id] — the person record's layout and panel
 * (prototype p14; organizations have no frame of their own). People are
 * linked and unlinked here exactly as organizations are on a person's
 * record (client, 2026-10-05): the link is one shared people_organizations
 * row, so it shows on both records, and each person's 5-organization limit
 * applies. Nothing is saved until "Submit changes" (one PATCH, one event).
 */
export function OrganizationRecord({ id }: { id: string }) {
  const router = useRouter();
  const toast = useToast();
  const canUpdate = useCan("directory.update");
  const canCreate = useCan("directory.create");
  const canDelete = useCan("directory.delete");
  const organization = useAdminData<Organization>(`/organizations/${id}`);
  const history = useAdminData<RecordHistory>(`/history/organization/${id}`);
  const [edit, setEdit] = useState<{ version: string; draft: Draft } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set());
  const touch = (key: string) => setTouched((previous) => (previous.has(key) ? previous : new Set(previous).add(key)));

  if (organization.error || !organization.data) {
    return (
      <RecordPage backHref="/admin/organizations" backLabel="Organizations" title="">
        {organization.error ? (
          <div>
            <StatusMessage tone="error">{organization.error.status === 404 ? "This organization doesn’t exist." : organization.error.message}</StatusMessage>
            {organization.error.status !== 404 ? <AdminButton onClick={organization.reload}>Retry</AdminButton> : null}
          </div>
        ) : (
          <StatusMessage>Loading organization…</StatusMessage>
        )}
      </RecordPage>
    );
  }

  const loaded = organization.data;
  const version = `${loaded.id}@${loaded.updatedAt}@${loaded.archivedAt}`;
  const base = toDraft(loaded);
  const draft = edit?.version === version ? edit.draft : base;
  const patch = patchFor(base, draft);
  const dirty = Object.keys(patch).length > 0;
  const set = <Key extends keyof Draft>(key: Key, value: Draft[Key]) => setEdit({ version, draft: { ...draft, [key]: value } });

  const found = organizationDraftErrors(draft);
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
      await adminApi(`/organizations/${id}`, { method: "PATCH", body: patch });
      toast("Organization updated");
      return true;
    } catch (caught) {
      setError(caught instanceof AdminApiError ? (caught.issues[0]?.message ?? caught.message) : "Couldn't save.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function duplicate() {
    setBusy("duplicating");
    setError(null);
    try {
      const copy = await adminApi<Organization>(`/organizations/${id}/duplicate`, { method: "POST" });
      toast("Organization duplicated");
      router.push(`/admin/organizations/${copy.id}`);
    } catch (caught) {
      setError(caught instanceof AdminApiError ? caught.message : "Couldn't duplicate this organization.");
      setBusy(null);
    }
  }

  async function setArchived(archived: boolean) {
    setBusy(archived ? "archiving" : "restoring");
    setError(null);
    try {
      await adminApi(`/organizations/${id}/${archived ? "archive" : "restore"}`, { method: "POST" });
      toast(archived ? "Organization archived" : "Organization restored");
      organization.reload();
    } catch (caught) {
      setError(caught instanceof AdminApiError ? caught.message : "Couldn't change the archive state.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <RecordPage
      backHref="/admin/organizations"
      backLabel="Organizations"
      title={draft.name}
      entity={{ type: "organization", id }}
      entityNoun="organization"
      recordLink={(other) => `/admin/organizations/${other}`}
      readOnly={!canUpdate}
      actions={{
        submit,
        discard: () => {
          setEdit(null);
          setError(null);
          setTouched(new Set());
        },
        duplicate: canCreate ? duplicate : undefined,
        archived: loaded.archivedAt !== null,
        setArchived,
        remove: canDelete
          ? {
              confirmText: loaded.name,
              run: async (confirm) => {
                await adminApi(`/organizations/${id}`, { method: "DELETE", body: { confirm } });
                toast("Organization deleted");
                router.push("/admin/organizations");
              },
            }
          : undefined,
        savedMessage: "Organization updated",
        dirty,
        busy,
      }}
    >
      {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}
      <PropertyRow icon="title" label="Name" htmlFor="organization-name" error={fieldErrors.name}>
        <input
          id="organization-name"
          value={draft.name}
          onChange={(e) => set("name", e.target.value)}
          onBlur={() => touch("name")}
          {...invalidProps("organization-name", fieldErrors.name)}
          maxLength={200}
          required
          autoComplete="off"
          placeholder="Organization name"
          className={recordInput}
        />
      </PropertyRow>
      <PropertyRow icon="title" label="Description" htmlFor="organization-description">
        <AutoGrowTextarea
          id="organization-description"
          value={draft.description}
          onChange={(e) => set("description", e.target.value)}
          maxLength={5000}
          placeholder="What the organization does…"
        />
      </PropertyRow>
      <PropertyRow icon="arrow_outward" label="Expertise" hint={LIMIT_HINTS.organizationExpertise}>
        <ExpertiseField selected={draft.expertise} onChange={(next) => set("expertise", next)} limitMessage={LIMIT_HINTS.organizationExpertise} />
      </PropertyRow>
      <PropertyRow icon="arrow_outward" label="People">
        <RelationPicker label="People" selected={draft.people} onChange={(next) => set("people", next)} search={searchPeople} />
      </PropertyRow>
      <PropertyRow icon="link" label="Website" htmlFor="organization-website" error={fieldErrors.website}>
        <input
          id="organization-website"
          inputMode="url"
          value={draft.website}
          onChange={(e) => set("website", e.target.value)}
          onBlur={() => touch("website")}
          {...invalidProps("organization-website", fieldErrors.website)}
          autoComplete="off"
          spellCheck={false}
          placeholder="https://"
          className={recordInput}
        />
      </PropertyRow>
      <PropertyRow icon="alternate_email" label="Email" htmlFor="organization-email" error={fieldErrors.email}>
        <input
          id="organization-email"
          type="email"
          inputMode="email"
          value={draft.email}
          onChange={(e) => set("email", e.target.value)}
          onBlur={() => touch("email")}
          {...invalidProps("organization-email", fieldErrors.email)}
          maxLength={320}
          autoComplete="off"
          spellCheck={false}
          placeholder="contact@example.org"
          className={recordInput}
        />
      </PropertyRow>
      <PropertyRow icon="title" label="Wise recipient ID" htmlFor="organization-wise">
        <input
          id="organization-wise"
          value={draft.wiseRecipientId}
          onChange={(e) => set("wiseRecipientId", e.target.value)}
          maxLength={100}
          autoComplete="off"
          spellCheck={false}
          placeholder="Wise recipient ID"
          className={recordInput}
        />
      </PropertyRow>
      <RecordMeta
        numberLabel="Organization ID"
        number={formatOrgNumber(loaded.orgNumber)}
        updatedAt={loaded.updatedAt}
        createdAt={loaded.createdAt}
        lastEditedBy={history.data?.lastEditedBy?.label ?? null}
        createdBy={history.data?.createdBy?.label ?? (loaded.notionPageId ? "Automation" : null)}
      />
      <CompletenessRow missing={organizationMissing(draft)} />
    </RecordPage>
  );
}
