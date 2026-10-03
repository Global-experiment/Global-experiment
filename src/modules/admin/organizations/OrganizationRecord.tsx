"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { adminApi, AdminApiError } from "../api/client";
import type { ExpertiseTree, Organization, OrganizationInput } from "../api/types";
import { useAdminData } from "../api/useAdminData";
import { expertiseSearch } from "../people/PersonRecord";
import { formatDate } from "../people/peopleTable";
import { AdminButton, focusRing, StatusMessage } from "../ui/controls";
import { PropertyRow, RecordHeader, recordInput } from "../ui/RecordForm";
import { RelationPicker, type RelationOption } from "../ui/RelationPicker";
import { useToast } from "../ui/Toast";

interface Draft {
  name: string;
  website: string;
  note: string;
  expertise: RelationOption[];
}

const toDraft = (organization: Organization): Draft => ({
  name: organization.name,
  website: organization.website ?? "",
  note: organization.note ?? "",
  expertise: organization.expertise.map((item) => ({ id: item.id, label: item.name, detail: `${item.field.name} · ${item.domain.name}` })),
});

function patchFor(base: Draft, draft: Draft): OrganizationInput {
  const patch: OrganizationInput = {};
  if (draft.name.trim() !== base.name.trim()) patch.name = draft.name;
  if (draft.website.trim() !== base.website.trim()) patch.website = draft.website.trim() || null;
  if (draft.note.trim() !== base.note.trim()) patch.note = draft.note.trim() || null;
  const ids = (options: RelationOption[]) => options.map((option) => option.id).sort().join(",");
  if (ids(draft.expertise) !== ids(base.expertise)) patch.expertiseIds = draft.expertise.map((option) => option.id);
  return patch;
}

/** /admin/organizations/[id]. People are linked from each person's record (one place to edit a membership). */
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
  const dirty = Object.keys(patch).length > 0;
  const set = <Key extends keyof Draft>(key: Key, value: Draft[Key]) => setEdit({ version, draft: { ...draft, [key]: value } });

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!dirty) return;
    setSaving(true);
    setError(null);
    try {
      await adminApi(`/organizations/${id}`, { method: "PATCH", body: patch });
      organization.reload();
      toast("Organization updated");
    } catch (caught) {
      setError(caught instanceof AdminApiError ? (caught.issues[0]?.message ?? caught.message) : "Couldn't save.");
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
        <PropertyRow icon="title" label="Name" htmlFor="organization-name">
          <input id="organization-name" value={draft.name} onChange={(e) => set("name", e.target.value)} maxLength={200} required autoComplete="off" className={recordInput} />
        </PropertyRow>
        <PropertyRow icon="link" label="Website" htmlFor="organization-website">
          <input id="organization-website" inputMode="url" value={draft.website} onChange={(e) => set("website", e.target.value)} autoComplete="off" spellCheck={false} className={recordInput} />
        </PropertyRow>
        <PropertyRow icon="title" label="Note" htmlFor="organization-note">
          <textarea id="organization-note" value={draft.note} onChange={(e) => set("note", e.target.value)} maxLength={5000} rows={3} className={`${recordInput} h-auto resize-y py-1`} />
        </PropertyRow>
        <PropertyRow icon="arrow_outward" label="Expertise">
          <RelationPicker label="Expertise" selected={draft.expertise} onChange={(next) => set("expertise", next)} search={searchExpertise} />
        </PropertyRow>
        <PropertyRow icon="arrow_outward" label="People">
          {loaded.people.length === 0 ? (
            <span className="text-text-muted">No people linked yet — add the organization from a person&rsquo;s record.</span>
          ) : (
            <ul>
              {loaded.people.map((person) => (
                <li key={person.id}>
                  <Link href={`/admin/people/${person.id}`} className={`underline underline-offset-2 ${focusRing}`}>
                    {person.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
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
