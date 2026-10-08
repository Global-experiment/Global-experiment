"use client";

import { useCallback, useState } from "react";
import { Icon } from "@/shared/ui/icons";
import { adminApi, AdminApiError } from "../api/client";
import type { ExpertiseTree, Organization, Page, PeopleOptions, Person } from "../api/types";
import { useAdminData } from "../api/useAdminData";
import { AdminButton, StatusMessage } from "../ui/controls";
import { PropertyRow, RecordHeader, recordInput, RecordSelect } from "../ui/RecordForm";
import { RelationPicker, type RelationOption } from "../ui/RelationPicker";
import { useToast } from "../ui/Toast";
import { formatDate } from "./peopleTable";
import { draftFromPerson, hasChanges, personPatch, type PersonDraft } from "./personForm";

type TextField = "email" | "phone" | "website" | "linkedin" | "x" | "otherContact";

const CONTACT_FIELDS: { field: TextField; label: string; icon: "alternate_email" | "call" | "link" | "title"; type?: string; inputMode?: "email" | "tel" | "url" }[] = [
  { field: "email", label: "Email", icon: "alternate_email", type: "email", inputMode: "email" },
  { field: "phone", label: "Phone", icon: "call", type: "tel", inputMode: "tel" },
  { field: "website", label: "Website", icon: "link", inputMode: "url" },
  { field: "linkedin", label: "Linkedin", icon: "link", inputMode: "url" },
  { field: "x", label: "X", icon: "link" },
  { field: "otherContact", label: "Other contact", icon: "title" },
];

export function expertiseSearch(tree: ExpertiseTree | undefined) {
  return async (text: string): Promise<RelationOption[]> => {
    const needle = text.trim().toLowerCase();
    return (tree?.domains ?? []).flatMap((domain) =>
      domain.fields.flatMap((field) =>
        field.items
          .filter((item) => !needle || `${item.name} ${field.name} ${domain.name}`.toLowerCase().includes(needle))
          .map((item) => ({ id: item.id, label: item.name, detail: `${field.name} · ${domain.name}` })),
      ),
    );
  };
}

export async function searchOrganizations(text: string, signal: AbortSignal): Promise<RelationOption[]> {
  const query = new URLSearchParams({ pageSize: "20", sort: "name:asc" });
  if (text.trim()) query.set("search", text.trim());
  const page = await adminApi<Page<Organization>>(`/organizations?${query}`, { signal });
  return page.items.map((organization) => ({ id: organization.id, label: organization.name, href: `/admin/organizations/${organization.id}` }));
}

/**
 * /admin/people/[id] — every native field and both relationships, saved
 * with one PATCH of only what changed (relationship sets replace
 * atomically server-side). Validation errors appear next to their field.
 */
export function PersonRecord({ id }: { id: string }) {
  const toast = useToast();
  const person = useAdminData<Person>(`/people/${id}`);
  const options = useAdminData<PeopleOptions>("/people/options");
  const tree = useAdminData<ExpertiseTree>("/expertise/tree");
  const [edit, setEdit] = useState<{ baseId: string; base: PersonDraft; draft: PersonDraft } | null>(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const searchExpertise = useCallback((text: string) => expertiseSearch(tree.data)(text), [tree.data]);

  if (person.error) {
    return (
      <main>
        <RecordHeader backHref="/admin/people" backLabel="People" title="" />
        <div className="px-2">
          <StatusMessage tone="error">{person.error.status === 404 ? "This person doesn’t exist." : person.error.message}</StatusMessage>
          {person.error.status !== 404 ? <AdminButton onClick={person.reload}>Retry</AdminButton> : null}
        </div>
      </main>
    );
  }
  if (!person.data) {
    return (
      <main>
        <RecordHeader backHref="/admin/people" backLabel="People" title="" />
        <StatusMessage>Loading person…</StatusMessage>
      </main>
    );
  }

  const loaded = person.data;
  const current = edit && edit.baseId === `${loaded.id}@${loaded.updatedAt}` ? edit : null;
  const base = current?.base ?? draftFromPerson(loaded);
  const draft = current?.draft ?? base;
  const patch = personPatch(base, draft);
  const dirty = hasChanges(patch);

  const set = <Key extends keyof PersonDraft>(key: Key, value: PersonDraft[Key]) => {
    setEdit({ baseId: `${loaded.id}@${loaded.updatedAt}`, base, draft: { ...draft, [key]: value } });
    if (errors[key]) {
      setErrors((previous) => {
        const next = { ...previous };
        delete next[key];
        return next;
      });
    }
  };

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!dirty) return;
    setSaving(true);
    setFormError(null);
    try {
      // The edit stays until the refreshed record (new updatedAt) replaces it — no flash of old values.
      await adminApi<Person>(`/people/${id}`, { method: "PATCH", body: patch });
      setErrors({});
      person.reload();
      toast("People updated");
    } catch (caught) {
      if (caught instanceof AdminApiError && caught.issues.length > 0) {
        const byField: Record<string, string> = {};
        for (const issue of caught.issues) {
          // Array issues arrive as "expertiseIds.0"; map API paths onto form fields.
          const root = issue.path.split(".")[0] ?? "";
          const key = root === "organizationIds" ? "organizations" : root === "expertiseIds" ? "expertise" : root === "lastFollowupAt" ? "lastFollowupDate" : root;
          byField[key || "form"] = issue.message;
        }
        setErrors(byField);
        setFormError(byField.form ?? "Some fields need attention.");
      } else {
        setFormError(caught instanceof AdminApiError ? caught.message : "Couldn't save.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <main>
      <form onSubmit={save} noValidate>
        <RecordHeader
          backHref="/admin/people"
          backLabel="People"
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
        {formError ? (
          <div className="px-2">
            <StatusMessage tone="error">{formError}</StatusMessage>
          </div>
        ) : null}

        <PropertyRow icon="title" label="Name" htmlFor="person-name" error={errors.name}>
          <input id="person-name" value={draft.name} onChange={(e) => set("name", e.target.value)} maxLength={200} required autoComplete="off" className={recordInput} />
        </PropertyRow>
        <PropertyRow icon="select" label="State" htmlFor="person-state" error={errors.stateKey}>
          <RecordSelect id="person-state" value={draft.stateKey} onChange={(e) => set("stateKey", e.target.value)}>
            <option value="">—</option>
            {(options.data?.states ?? []).map((state) => (
              <option key={state.key} value={state.key}>
                {state.label}
              </option>
            ))}
          </RecordSelect>
        </PropertyRow>
        <PropertyRow icon="select" label="Source" htmlFor="person-source" error={errors.sourceKey}>
          <RecordSelect id="person-source" value={draft.sourceKey} onChange={(e) => set("sourceKey", e.target.value)}>
            <option value="">—</option>
            {(options.data?.sources ?? []).map((source) => (
              <option key={source.key} value={source.key}>
                {source.label}
              </option>
            ))}
          </RecordSelect>
        </PropertyRow>
        <PropertyRow icon="arrow_outward" label="Expertise" error={errors.expertise}>
          <RelationPicker label="Expertise" selected={draft.expertise} onChange={(next) => set("expertise", next)} search={searchExpertise} />
        </PropertyRow>
        <PropertyRow icon="title" label="Personal note" htmlFor="person-note" error={errors.personalNote}>
          <textarea
            id="person-note"
            value={draft.personalNote}
            onChange={(e) => set("personalNote", e.target.value)}
            maxLength={5000}
            rows={3}
            className={`${recordInput} h-auto resize-y py-1`}
          />
        </PropertyRow>
        <PropertyRow icon="arrow_outward" label="Organization" error={errors.organizations}>
          <RelationPicker label="Organization" selected={draft.organizations} onChange={(next) => set("organizations", next)} search={searchOrganizations} />
        </PropertyRow>
        <PropertyRow icon="check_box" label="Do not contact" htmlFor="person-dnc">
          {/* Native checkbox for semantics/keyboard; Figma's check_box glyphs for the look. */}
          <span className="relative inline-flex size-4">
            <input
              id="person-dnc"
              type="checkbox"
              checked={draft.doNotContact}
              onChange={(e) => set("doNotContact", e.target.checked)}
              className="peer absolute inset-0 cursor-pointer opacity-0"
            />
            <Icon
              name={draft.doNotContact ? "check_box" : "check_box_outline_blank"}
              className={`pointer-events-none peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-text-primary ${draft.doNotContact ? "" : "text-text-muted"}`}
            />
          </span>
        </PropertyRow>
        {CONTACT_FIELDS.map(({ field, label, icon, type, inputMode }) => (
          <PropertyRow key={field} icon={icon} label={label} htmlFor={`person-${field}`} error={errors[field]}>
            <input
              id={`person-${field}`}
              type={type ?? "text"}
              inputMode={inputMode}
              value={draft[field]}
              onChange={(e) => set(field, e.target.value)}
              autoComplete="off"
              spellCheck={false}
              className={recordInput}
            />
          </PropertyRow>
        ))}
        <PropertyRow icon="schedule" label="Last followup" htmlFor="person-followup" error={errors.lastFollowupDate}>
          <input
            id="person-followup"
            type="date"
            value={draft.lastFollowupDate}
            onChange={(e) => set("lastFollowupDate", e.target.value)}
            className={`${recordInput} max-w-[200px] [color-scheme:dark]`}
          />
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
