"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { adminApi, AdminApiError } from "../api/client";
import { formatPersonNumber, type Organization, type Page, type PeopleOptions, type Person } from "../api/types";
import { useAdminData } from "../api/useAdminData";
import { personMissing } from "../completeness";
import { ExpertiseField } from "../expertise/ExpertiseField";
import { LIMIT_HINTS, RELATION_LIMITS } from "../relationLimits";
import { CompletenessRow } from "../ui/CompletenessRow";
import { AdminButton, StatusMessage } from "../ui/controls";
import { AutoGrowTextarea, DateField, formatPanelDate, PanelButton, PanelRow, Pills, PropertyRow, RecordLayout, recordInput } from "../ui/RecordForm";
import { RelationPicker, type RelationOption } from "../ui/RelationPicker";
import { useToast } from "../ui/Toast";
import { formatDate } from "./peopleTable";
import { draftFromPerson, hasChanges, personPatch, type PersonDraft } from "./personForm";

type TextField = "email" | "phone" | "website" | "linkedin" | "x" | "otherContact" | "wiseRecipientId";

const CONTACT_FIELDS: { field: TextField; label: string; icon: "alternate_email" | "call" | "link" | "title"; type?: string; inputMode?: "email" | "tel" | "url" }[] = [
  { field: "email", label: "Email", icon: "alternate_email", type: "email", inputMode: "email" },
  { field: "phone", label: "Phone", icon: "call", type: "tel", inputMode: "tel" },
  { field: "website", label: "Website", icon: "link", inputMode: "url" },
  { field: "linkedin", label: "Linkedin", icon: "link", inputMode: "url" },
  { field: "x", label: "X", icon: "link" },
  { field: "otherContact", label: "Other contact", icon: "title" },
  { field: "wiseRecipientId", label: "Wise recipient ID", icon: "title" },
];

const CONTACT_PILLS = [
  { value: "contact", label: "Contact" },
  { value: "do_not_contact", label: "Do not contact" },
] as const;

export async function searchOrganizations(text: string, signal: AbortSignal): Promise<RelationOption[]> {
  const query = new URLSearchParams({ pageSize: "20", sort: "name:asc" });
  if (text.trim()) query.set("search", text.trim());
  const page = await adminApi<Page<Organization>>(`/organizations?${query}`, { signal });
  return page.items.map((organization) => ({ id: organization.id, label: organization.name, href: `/admin/organizations/${organization.id}` }));
}

/**
 * /admin/people/[id] (admin-desktop.pdf p12) — every native field and both
 * relationships, saved with one PATCH of only what changed (relationship
 * sets replace atomically server-side). Validation errors appear next to
 * their field. Not shown yet (future modules): Access grant, Expenses and
 * the History panel — the layout keeps room for them.
 */
export function PersonRecord({ id }: { id: string }) {
  const router = useRouter();
  const toast = useToast();
  const person = useAdminData<Person>(`/people/${id}`);
  const options = useAdminData<PeopleOptions>("/people/options");
  const [edit, setEdit] = useState<{ baseId: string; base: PersonDraft; draft: PersonDraft } | null>(null);
  const [busy, setBusy] = useState<"saving" | "duplicating" | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  if (person.error || !person.data) {
    return (
      <RecordLayout backHref="/admin/people" backLabel="People" title="">
        {person.error ? (
          <div>
            <StatusMessage tone="error">{person.error.status === 404 ? "This person doesn’t exist." : person.error.message}</StatusMessage>
            {person.error.status !== 404 ? <AdminButton onClick={person.reload}>Retry</AdminButton> : null}
          </div>
        ) : (
          <StatusMessage>Loading person…</StatusMessage>
        )}
      </RecordLayout>
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
    setBusy("saving");
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
          const key = root === "organizationIds" ? "organizations" : root === "expertiseIds" ? "expertise" : root;
          byField[key || "form"] = issue.message;
        }
        setErrors(byField);
        setFormError(byField.form ?? "Some fields need attention.");
      } else {
        setFormError(caught instanceof AdminApiError ? caught.message : "Couldn't save.");
      }
    } finally {
      setBusy(null);
    }
  }

  async function duplicate() {
    setBusy("duplicating");
    setFormError(null);
    try {
      const copy = await adminApi<Person>(`/people/${id}/duplicate`, { method: "POST" });
      toast("Person duplicated");
      router.push(`/admin/people/${copy.id}`);
    } catch (caught) {
      setFormError(caught instanceof AdminApiError ? caught.message : "Couldn't duplicate this person.");
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
        {formatPersonNumber(loaded.personNumber)}
      </PanelRow>
      <div className="mt-1 flex flex-col gap-2">
        <PanelButton icon="restart_alt" onClick={() => setEdit(null)} disabled={!dirty || busy !== null}>
          Discard changes
        </PanelButton>
        <PanelButton
          icon="content_copy"
          onClick={() => void duplicate()}
          disabled={dirty || busy !== null}
          title={dirty ? "Submit or discard your changes first" : "Create a copy of this person and open it"}
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
      <RecordLayout backHref="/admin/people" backLabel="People" title={draft.name} panel={panel}>
        {formError ? <StatusMessage tone="error">{formError}</StatusMessage> : null}
        <PropertyRow icon="title" label="Name" htmlFor="person-name" error={errors.name}>
          <input id="person-name" value={draft.name} onChange={(e) => set("name", e.target.value)} maxLength={200} required autoComplete="off" className={recordInput} />
        </PropertyRow>
        <PropertyRow icon="select" label="State" error={errors.stateKey}>
          <Pills
            label="State"
            allowEmpty
            options={(options.data?.states ?? []).map((state) => ({ value: state.key, label: state.label }))}
            value={draft.stateKey}
            onChange={(value) => set("stateKey", value)}
          />
        </PropertyRow>
        <PropertyRow icon="select" label="Source" error={errors.sourceKey}>
          <Pills
            label="Source"
            allowEmpty
            options={(options.data?.sources ?? []).map((source) => ({ value: source.key, label: source.label }))}
            value={draft.sourceKey}
            onChange={(value) => set("sourceKey", value)}
          />
        </PropertyRow>
        <PropertyRow icon="arrow_outward" label="Expertise" hint={LIMIT_HINTS.personExpertise} error={errors.expertise}>
          <ExpertiseField selected={draft.expertise} onChange={(next) => set("expertise", next)} limitMessage={LIMIT_HINTS.personExpertise} />
        </PropertyRow>
        <PropertyRow icon="title" label="Personal note" htmlFor="person-note" error={errors.personalNote}>
          <AutoGrowTextarea
            id="person-note"
            value={draft.personalNote}
            onChange={(e) => set("personalNote", e.target.value)}
            maxLength={5000}
            placeholder="Empty"
          />
        </PropertyRow>
        <PropertyRow icon="arrow_outward" label="Organization" hint={LIMIT_HINTS.personOrganizations} error={errors.organizations}>
          <RelationPicker
            label="Organization"
            selected={draft.organizations}
            onChange={(next) => set("organizations", next)}
            search={searchOrganizations}
            max={RELATION_LIMITS.organizationsPerPerson}
            limitMessage={LIMIT_HINTS.personOrganizations}
          />
        </PropertyRow>
        <PropertyRow icon="check_box" label="Do not contact">
          <Pills
            label="Do not contact"
            options={CONTACT_PILLS}
            value={draft.doNotContact ? "do_not_contact" : "contact"}
            onChange={(value) => set("doNotContact", value === "do_not_contact")}
          />
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
              placeholder="Empty"
              className={recordInput}
            />
          </PropertyRow>
        ))}
        <PropertyRow icon="schedule" label="Follow-up date" htmlFor="person-followup" error={errors.nextFollowupOn}>
          <DateField id="person-followup" label="Follow-up date" value={draft.nextFollowupOn} onChange={(value) => set("nextFollowupOn", value)} />
        </PropertyRow>
        {loaded.lastFollowupAtLegacy ? (
          // Kept from before the Follow-up date meant "next" (migration 0002): read-only.
          <PropertyRow icon="schedule" label="Last followup (legacy)">
            <span className="px-2">{formatDate(loaded.lastFollowupAtLegacy)}</span>
          </PropertyRow>
        ) : null}
        <CompletenessRow missing={personMissing(draft)} />
      </RecordLayout>
    </form>
  );
}
