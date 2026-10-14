"use client";

import { useCallback, useState } from "react";
import { adminApi, AdminApiError } from "../api/client";
import { formatOrgNumber, type ExpertiseTree, type Organization, type OrganizationInput, type Page, type Person } from "../api/types";
import { useAdminData } from "../api/useAdminData";
import { expertiseSearch } from "../people/PersonRecord";
import { formatDate } from "../people/peopleTable";
import { AdminButton, StatusMessage } from "../ui/controls";
import { PropertyRow, RecordHeader, recordInput } from "../ui/RecordForm";
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
  expertise: organization.expertise.map((item) => ({ id: item.id, label: item.name, detail: `${item.field.name} · ${item.domain.name}` })),
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

async function searchPeople(text: string, signal: AbortSignal): Promise<RelationOption[]> {
  const query = new URLSearchParams({ pageSize: "20", sort: "name:asc" });
  if (text.trim()) query.set("search", text.trim());
  const page = await adminApi<Page<Person>>(`/people?${query}`, { signal });
  return page.items.map(personOption);
}

/**
 * /admin/organizations/[id]. People can be linked/unlinked here exactly as
 * organizations are on a person's record (client, 2026-10-05): the same
 * relation picker, saved with the page. The link is one shared
 * people_organizations row, so it shows on both records, each linking to
 * the other.
 */
export function OrganizationRecord({ id }: { id: string }) {
  const toast = useToast();
  const organization = useAdminData<Organization>(`/organizations/${id}`);
  const tree = useAdminData<ExpertiseTree>("/expertise/tree");
  const [edit, setEdit] = useState<{ version: string; draft: Draft } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchExpertise = useCallback((text: string) => expertiseSearch(tree.data)(text), [tree.data]);

  if (organization.error) {
    return (
      <main>
        <RecordHeader backHref="/admin/organizations" backLabel="Organizations" title="" />
        <div className="px-2">
          <StatusMessage tone="error">{organization.error.status === 404 ? "This organization doesn’t exist." : organization.error.message}</StatusMessage>
        </div>
      </main>
    );
  }
  if (!organization.data) {
    return (
      <main>
        <RecordHeader backHref="/admin/organizations" backLabel="Organizations" title="" />
        <StatusMessage>Loading organization…</StatusMessage>
      </main>
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
    setSaving(true);
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
      setSaving(false);
    }
  }

  return (
    <main>
      <form onSubmit={save} noValidate>
        <RecordHeader
          backHref="/admin/organizations"
          backLabel="Organizations"
          title={draft.name}
          actions={
            <>
              {dirty ? (
                <AdminButton onClick={() => setEdit(null)} disabled={saving}>
                  Discard changes
                </AdminButton>
              ) : null}
              <AdminButton type="submit" icon="check_circle" disabled={!dirty || saving}>
                {saving ? "Saving…" : "Save"}
              </AdminButton>
            </>
          }
        />
        {error ? (
          <div className="px-2">
            <StatusMessage tone="error">{error}</StatusMessage>
          </div>
        ) : null}
        <PropertyRow icon="numbers" label="Organization ID">
          <span>{formatOrgNumber(loaded.orgNumber)}</span>
        </PropertyRow>
        <PropertyRow icon="title" label="Name" htmlFor="organization-name">
          <input id="organization-name" value={draft.name} onChange={(e) => set("name", e.target.value)} maxLength={200} required autoComplete="off" className={recordInput} />
        </PropertyRow>
        <PropertyRow icon="title" label="Description" htmlFor="organization-description">
          <textarea
            id="organization-description"
            value={draft.description}
            onChange={(e) => set("description", e.target.value)}
            maxLength={5000}
            rows={3}
            className={`${recordInput} h-auto resize-y py-1`}
          />
        </PropertyRow>
        <PropertyRow icon="link" label="Website" htmlFor="organization-website">
          <input id="organization-website" inputMode="url" value={draft.website} onChange={(e) => set("website", e.target.value)} autoComplete="off" spellCheck={false} className={recordInput} />
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
            className={recordInput}
          />
        </PropertyRow>
        <PropertyRow icon="arrow_outward" label="Expertise">
          <RelationPicker label="Expertise" selected={draft.expertise} onChange={(next) => set("expertise", next)} search={searchExpertise} />
        </PropertyRow>
        <PropertyRow icon="arrow_outward" label="People">
          <RelationPicker label="Person" selected={draft.people} onChange={(next) => set("people", next)} search={searchPeople} />
        </PropertyRow>
        <PropertyRow icon="schedule" label="Created">
          <span>{formatDate(loaded.createdAt)}</span>
        </PropertyRow>
        <PropertyRow icon="schedule" label="Updated">
          <span>{formatDate(loaded.updatedAt)}</span>
        </PropertyRow>
      </form>
    </main>
  );
}
