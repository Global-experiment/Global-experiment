"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { adminApi, AdminApiError } from "../api/client";
import { formatOrgNumber, type Organization, type OrganizationInput, type Page, type Person } from "../api/types";
import { useAdminData } from "../api/useAdminData";
import { organizationMissing } from "../completeness";
import { ExpertiseField } from "../expertise/ExpertiseField";
import { linkedExpertiseOption } from "../expertise/expertiseOptions";
import { LIMIT_HINTS, RELATION_LIMITS } from "../relationLimits";
import { CompletenessRow } from "../ui/CompletenessRow";
import { StatusMessage } from "../ui/controls";
import { AutoGrowTextarea, formatPanelDate, PanelButton, PanelRow, PropertyRow, RecordLayout, recordInput } from "../ui/RecordForm";
import { RelationPicker, type RelationOption } from "../ui/RelationPicker";
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
  if (ids(draft.expertise) !== ids(base.expertise)) patch.expertiseIds = draft.expertise.map((option) => option.id);
  return patch;
}

/** People added/removed in the draft — applied through the organization's link endpoints. */
function peopleChanges(base: Draft, draft: Draft) {
  const before = new Set(base.people.map((person) => person.id));
  const after = new Set(draft.people.map((person) => person.id));
  return {
    added: [...after].filter((id) => !before.has(id)),
    removed: [...before].filter((id) => !after.has(id)),
  };
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
 * /admin/organizations/[id] — the person record's layout (admin-desktop.pdf
 * p12; organizations have no frame of their own). People are linked and
 * unlinked here exactly as organizations are on a person's record (client,
 * 2026-10-05): the link is one shared people_organizations row, so it shows
 * on both records, and each person's 5-organization limit applies.
 */
export function OrganizationRecord({ id }: { id: string }) {
  const router = useRouter();
  const toast = useToast();
  const organization = useAdminData<Organization>(`/organizations/${id}`);
  const [edit, setEdit] = useState<{ version: string; draft: Draft } | null>(null);
  const [busy, setBusy] = useState<"saving" | "duplicating" | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (organization.error || !organization.data) {
    return (
      <RecordLayout backHref="/admin/organizations" backLabel="Organizations" title="">
        {organization.error ? (
          <StatusMessage tone="error">{organization.error.status === 404 ? "This organization doesn’t exist." : organization.error.message}</StatusMessage>
        ) : (
          <StatusMessage>Loading organization…</StatusMessage>
        )}
      </RecordLayout>
    );
  }

  const loaded = organization.data;
  const version = `${loaded.id}@${loaded.updatedAt}`;
  const base = toDraft(loaded);
  const draft = edit?.version === version ? edit.draft : base;
  const patch = patchFor(base, draft);
  const links = peopleChanges(base, draft);
  const dirty = Object.keys(patch).length > 0 || links.added.length > 0 || links.removed.length > 0;
  const set = <Key extends keyof Draft>(key: Key, value: Draft[Key]) => setEdit({ version, draft: { ...draft, [key]: value } });

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!dirty) return;
    setBusy("saving");
    setError(null);
    try {
      if (Object.keys(patch).length > 0) await adminApi(`/organizations/${id}`, { method: "PATCH", body: patch });
      for (const personId of links.added) await adminApi(`/organizations/${id}/people/${personId}`, { method: "PUT" });
      for (const personId of links.removed) await adminApi(`/organizations/${id}/people/${personId}`, { method: "DELETE" });
      // The edit stays until the refreshed record (new updatedAt) replaces it.
      organization.reload();
      toast("Organization updated");
    } catch (caught) {
      setError(caught instanceof AdminApiError ? (caught.issues[0]?.message ?? caught.message) : "Couldn't save.");
      // Some steps may have applied: show the server's state.
      organization.reload();
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

  const panel = (
    <>
      <PanelRow icon="schedule" label="Last updated">
        {formatPanelDate(loaded.updatedAt)}
      </PanelRow>
      <PanelRow icon="schedule" label="Created">
        {formatPanelDate(loaded.createdAt)}
      </PanelRow>
      <PanelRow icon="numbers" label="Number">
        {formatOrgNumber(loaded.orgNumber)}
      </PanelRow>
      <div className="mt-1 flex flex-col gap-2">
        <PanelButton icon="restart_alt" onClick={() => setEdit(null)} disabled={!dirty || busy !== null}>
          Discard changes
        </PanelButton>
        <PanelButton
          icon="content_copy"
          onClick={() => void duplicate()}
          disabled={dirty || busy !== null}
          title={dirty ? "Submit or discard your changes first" : "Create a copy of this organization (without its people) and open it"}
        >
          {busy === "duplicating" ? "Duplicating…" : "Duplicate"}
        </PanelButton>
        <PanelButton icon="check_circle" type="submit" disabled={!dirty || busy !== null}>
          {busy === "saving" ? "Submitting…" : "Submit changes"}
        </PanelButton>
      </div>
    </>
  );

  return (
    <form onSubmit={save} noValidate className="h-full">
      <RecordLayout backHref="/admin/organizations" backLabel="Organizations" title={draft.name} panel={panel}>
        {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}
        <PropertyRow icon="title" label="Name" htmlFor="organization-name">
          <input id="organization-name" value={draft.name} onChange={(e) => set("name", e.target.value)} maxLength={200} required autoComplete="off" className={recordInput} />
        </PropertyRow>
        <PropertyRow icon="title" label="Description" htmlFor="organization-description">
          <AutoGrowTextarea
            id="organization-description"
            value={draft.description}
            onChange={(e) => set("description", e.target.value)}
            maxLength={5000}
            placeholder="Empty"
          />
        </PropertyRow>
        <PropertyRow icon="arrow_outward" label="Expertise" hint={LIMIT_HINTS.organizationExpertise}>
          <ExpertiseField selected={draft.expertise} onChange={(next) => set("expertise", next)} limitMessage={LIMIT_HINTS.organizationExpertise} />
        </PropertyRow>
        <PropertyRow icon="arrow_outward" label="People">
          <RelationPicker label="People" selected={draft.people} onChange={(next) => set("people", next)} search={searchPeople} />
        </PropertyRow>
        <PropertyRow icon="link" label="Website" htmlFor="organization-website">
          <input
            id="organization-website"
            inputMode="url"
            value={draft.website}
            onChange={(e) => set("website", e.target.value)}
            autoComplete="off"
            spellCheck={false}
            placeholder="Empty"
            className={recordInput}
          />
        </PropertyRow>
        <PropertyRow icon="alternate_email" label="Email" htmlFor="organization-email">
          <input
            id="organization-email"
            type="email"
            inputMode="email"
            value={draft.email}
            onChange={(e) => set("email", e.target.value)}
            maxLength={320}
            autoComplete="off"
            spellCheck={false}
            placeholder="Empty"
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
            placeholder="Empty"
            className={recordInput}
          />
        </PropertyRow>
        <CompletenessRow missing={organizationMissing(draft)} />
      </RecordLayout>
    </form>
  );
}

