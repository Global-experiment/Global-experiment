"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { adminApi, AdminApiError } from "../api/client";
import { formatPersonNumber, type Organization, type Page, type PeopleOptions, type Person, type PersonInput, type RecordHistory } from "../api/types";
import { useAdminData } from "../api/useAdminData";
import { personMissing } from "../completeness";
import { ExpertiseField } from "../expertise/ExpertiseField";
import { duplicateName } from "../record/duplicateName";
import { RecordMeta } from "../record/RecordMeta";
import { RecordPage } from "../record/RecordPage";
import { LIMIT_HINTS, RELATION_LIMITS } from "../relationLimits";
import { CompletenessRow } from "../ui/CompletenessRow";
import { AdminButton, StatusMessage } from "../ui/controls";
import { AutoGrowTextarea, CheckboxField, DateField, DateTimeField, invalidProps, Pills, PropertyRow, ReadOnlyValue, recordInput } from "../ui/RecordForm";
import { RelationPicker, type RelationOption } from "../ui/RelationPicker";
import { useToast } from "../ui/Toast";
import { formatDate } from "./peopleTable";
import { draftFromPerson, expenseOption, hasChanges, personCreateBody, personDraftErrors, personPatch, type PersonDraft } from "./personForm";
import { PERSON_RECORD_CONFIG } from "./personRecordConfig";

/** The info card on Contact channels (client, 2026-10-22); the order is set by drag and drop. */
export const PREFERRED_CHANNEL_HINT = "The first value is the preferred way of contact.";

type TextField = "email" | "phone" | "website" | "x" | "linkedin" | "otherSocials" | "wiseRecipientId";

/** The contact fields in the prototype's order (Figma p14). */
const CONTACT_FIELDS: {
  field: TextField;
  label: string;
  icon: "alternate_email" | "call" | "link" | "title";
  placeholder: string;
  type?: string;
  inputMode?: "email" | "tel" | "url";
}[] = [
  { field: "email", label: "Email", icon: "alternate_email", placeholder: "name@example.com", type: "email", inputMode: "email" },
  { field: "phone", label: "Phone", icon: "call", placeholder: "+41 79 123 45 67", type: "tel", inputMode: "tel" },
  { field: "website", label: "Website", icon: "link", placeholder: "https://", inputMode: "url" },
  { field: "x", label: "X", icon: "link", placeholder: "https://", inputMode: "url" },
  { field: "linkedin", label: "LinkedIn", icon: "link", placeholder: "https://", inputMode: "url" },
  { field: "otherSocials", label: "Other socials", icon: "link", placeholder: "https://", inputMode: "url" },
];

export async function searchOrganizations(text: string, signal: AbortSignal): Promise<RelationOption[]> {
  const query = new URLSearchParams({ pageSize: "20", sort: "name:asc" });
  if (text.trim()) query.set("search", text.trim());
  const page = await adminApi<Page<Organization>>(`/organizations?${query}`, { signal });
  return page.items.map((organization) => ({ id: organization.id, label: organization.name, href: `/admin/organizations/${organization.id}` }));
}

/**
 * Expenses with no recipient yet (an expense has one recipient), latest
 * first; search by name or EXP-n. Notion-managed expenses are listed but
 * can't be picked: the Treasury import sets their recipient from Notion.
 */
export async function searchExpenses(text: string, signal: AbortSignal): Promise<RelationOption[]> {
  const query = new URLSearchParams({ pageSize: "20", sort: "occurred:desc" });
  query.append("filter", "type:is:expense");
  query.append("filter", "recipient:is_empty");
  if (text.trim()) query.set("search", text.trim());
  const page = await adminApi<Page<{ id: string; number: number; name: string; currency: string; grossAmount: number; managedBy: "notion" | "native" }>>(`/treasury?${query}`, { signal });
  return page.items.map((row) => {
    const notion = row.managedBy === "notion";
    return {
      ...expenseOption({ id: row.id, entryNumber: row.number, currency: row.currency, grossAmount: row.grossAmount }),
      detail: notion ? `${row.name} · Managed in Notion` : row.name,
      disabled: notion,
      muted: notion,
      disabledReason: notion ? "Managed in Notion: set its recipient there" : undefined,
    };
  });
}

/** Field errors as shown: the draft's own problems for the fields left (or all, after Submit), then the API's. */
function shownErrors(draft: PersonDraft, touched: ReadonlySet<string>, server: Record<string, string>) {
  const found = personDraftErrors(draft);
  return { ...server, ...Object.fromEntries(Object.entries(found).filter(([key]) => touched.has(key))) };
}

/** A copy made with "Duplicate as a draft" travels to /admin/people/new in the tab's session storage (never saved until Submit). */
const DRAFT_KEY = "ge-person-draft";

function readStoredDraft(): PersonDraft | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as PersonDraft) : null;
  } catch {
    return null;
  }
}

/**
 * /admin/people/[id] — the person record of the client's prototype (Figma p14
 * and its four screenshots): every field in the prototype's order, the right
 * panel with Duplicate / Submit changes / More options, the Views and Edits
 * counters and the history. Nothing is saved until "Submit changes" (one
 * PATCH of what changed = one history event), which returns to the previous
 * page. /admin/people/new is a "Duplicate as a draft" copy, created on Submit.
 */
export function PersonRecord({ id }: { id: string }) {
  if (id === "new") return <NewPersonRecord />;
  return <ExistingPersonRecord id={id} />;
}

function ExistingPersonRecord({ id }: { id: string }) {
  const router = useRouter();
  const toast = useToast();
  const person = useAdminData<Person>(`/people/${id}`);
  const options = useAdminData<PeopleOptions>("/people/options");
  const history = useAdminData<RecordHistory>(`/history/person/${id}`);
  const [edit, setEdit] = useState<{ baseId: string; base: PersonDraft; draft: PersonDraft } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set());
  const [formError, setFormError] = useState<string | null>(null);
  const touch = (key: string) => setTouched((previous) => (previous.has(key) ? previous : new Set(previous).add(key)));

  if (person.error || !person.data) {
    return (
      <RecordPage backHref="/admin/people" backLabel="People" title="">
        {person.error ? (
          <div>
            <StatusMessage tone="error">{person.error.status === 404 ? "This person doesn’t exist." : person.error.message}</StatusMessage>
            {person.error.status !== 404 ? <AdminButton onClick={person.reload}>Retry</AdminButton> : null}
          </div>
        ) : (
          <StatusMessage>Loading person…</StatusMessage>
        )}
      </RecordPage>
    );
  }

  const loaded = person.data;
  const baseId = `${loaded.id}@${loaded.updatedAt}@${loaded.archivedAt}`;
  const current = edit && edit.baseId === baseId ? edit : null;
  const base = current?.base ?? draftFromPerson(loaded);
  const draft = current?.draft ?? base;
  const patch = personPatch(base, draft);
  const dirty = hasChanges(patch);

  const set = <Key extends keyof PersonDraft>(key: Key, value: PersonDraft[Key]) => {
    setEdit({ baseId, base, draft: { ...draft, [key]: value } });
    if (errors[key]) {
      setErrors((previous) => {
        const next = { ...previous };
        delete next[key];
        return next;
      });
    }
  };

  async function submit(): Promise<boolean> {
    const found = personDraftErrors(draft);
    if (Object.keys(found).length > 0) {
      setTouched(new Set([...touched, ...Object.keys(found)]));
      setFormError("Some fields need attention.");
      return false;
    }
    setBusy("saving");
    setFormError(null);
    try {
      await adminApi<Person>(`/people/${id}`, { method: "PATCH", body: patch });
      toast("People updated");
      return true;
    } catch (caught) {
      showErrors(caught, setErrors, setFormError);
      return false;
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

  async function setArchived(archived: boolean) {
    setBusy(archived ? "archiving" : "restoring");
    try {
      await adminApi(`/people/${id}/${archived ? "archive" : "restore"}`, { method: "POST" });
      toast(archived ? "Person archived" : "Person restored");
      person.reload();
    } catch (caught) {
      setFormError(caught instanceof AdminApiError ? caught.message : "Couldn't change the archive state.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <RecordPage
      backHref="/admin/people"
      backLabel="People"
      title={draft.name}
      entity={{ type: "person", id }}
      recordLink={(other) => `/admin/people/${other}`}
      actions={{
        submit,
        discard: () => {
          setEdit(null);
          setErrors({});
          setTouched(new Set());
          setFormError(null);
        },
        duplicate,
        duplicateAsDraft: () => {
          try {
            // Like Duplicate: the copy's name ends in DUPLICATE (client, 2026-10-22).
            sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ ...draft, name: duplicateName(draft.name), expenses: [] }));
          } catch {
            // Storage blocked: the draft page starts empty instead.
          }
          router.push("/admin/people/new");
        },
        archived: loaded.archivedAt !== null,
        setArchived,
        remove: {
          confirmText: loaded.name,
          run: async (confirm) => {
            await adminApi(`/people/${id}`, { method: "DELETE", body: { confirm } });
            toast("Person deleted");
            router.push("/admin/people");
          },
        },
        savedMessage: "People updated",
        dirty,
        busy,
      }}
    >
      <PersonFields
        draft={draft}
        set={set}
        touch={touch}
        errors={shownErrors(draft, touched, errors)}
        formError={formError}
        options={options.data}
        meta={{
          number: formatPersonNumber(loaded.personNumber),
          updatedAt: loaded.updatedAt,
          createdAt: loaded.createdAt,
          lastEditedBy: history.data?.lastEditedBy?.label ?? null,
          createdBy: history.data?.createdBy?.label ?? (loaded.notionPageId ? "Automation" : null),
          legacyFollowUp: loaded.lastFollowupAtLegacy,
        }}
      />
    </RecordPage>
  );
}

function NewPersonRecord() {
  const router = useRouter();
  const toast = useToast();
  const options = useAdminData<PeopleOptions>("/people/options");
  const [draft, setDraft] = useState<PersonDraft | null>(() => (typeof window === "undefined" ? null : readStoredDraft()));
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set());
  const [formError, setFormError] = useState<string | null>(null);
  const touch = (key: string) => setTouched((previous) => (previous.has(key) ? previous : new Set(previous).add(key)));

  if (!draft) {
    return (
      <RecordPage backHref="/admin/people" backLabel="People" title="New person">
        <StatusMessage>Nothing to duplicate here: use “Duplicate as a draft” on a person.</StatusMessage>
      </RecordPage>
    );
  }
  const set = <Key extends keyof PersonDraft>(key: Key, value: PersonDraft[Key]) => setDraft({ ...draft, [key]: value });

  async function submit(): Promise<boolean> {
    const found = personDraftErrors(draft!);
    if (Object.keys(found).length > 0) {
      setTouched(new Set([...touched, ...Object.keys(found)]));
      setFormError("Some fields need attention.");
      return false;
    }
    setBusy("saving");
    setFormError(null);
    try {
      const created = await adminApi<Person>("/people", { method: "POST", body: personCreateBody(draft!) satisfies PersonInput });
      try {
        sessionStorage.removeItem(DRAFT_KEY);
      } catch {
        // Storage blocked: nothing to clear.
      }
      toast("Person created");
      router.replace(`/admin/people/${created.id}`);
      return false; // Already on its way to the new record.
    } catch (caught) {
      showErrors(caught, setErrors, setFormError);
      return false;
    } finally {
      setBusy(null);
    }
  }

  return (
    <RecordPage
      backHref="/admin/people"
      backLabel="People"
      title={draft.name}
      actions={{
        submit,
        discard: () => {
          setDraft(readStoredDraft());
          setErrors({});
        },
        savedMessage: "Person created",
        dirty: true,
        busy,
      }}
    >
      <p role="status" className="px-2 text-meta text-text-muted">
        A draft copy: nothing is saved until “Submit changes”.
      </p>
      <PersonFields draft={draft} set={set} touch={touch} errors={shownErrors(draft, touched, errors)} formError={formError} options={options.data} />
    </RecordPage>
  );
}

function showErrors(caught: unknown, setErrors: (errors: Record<string, string>) => void, setFormError: (message: string) => void) {
  if (caught instanceof AdminApiError && caught.issues.length > 0) {
    const byField: Record<string, string> = {};
    for (const issue of caught.issues) {
      // Array issues arrive as "expertiseIds.0"; map API paths onto form fields.
      const root = issue.path.split(".")[0] ?? "";
      const key = root === "organizationIds" ? "organizations" : root === "expertiseIds" ? "expertise" : root === "expenseIds" ? "expenses" : root === "contactChannelKeys" ? "contactChannels" : root;
      byField[key || "form"] = issue.message;
    }
    setErrors(byField);
    setFormError(byField.form ?? "Some fields need attention.");
  } else {
    setFormError(caught instanceof AdminApiError ? caught.message : "Couldn't save.");
  }
}

/**
 * The person's fields, in the prototype's order (Figma p14 + screenshots):
 * Name, Expertise, Description, Source, State, Email, Website, X, LinkedIn,
 * Other socials, Other contact details, Contact channels, Do not contact,
 * AI relevance score, Relevance score, Organizations, Expenses, First and
 * Last contact, Follow-up date, then Person ID, Updated, Last edited by,
 * Created, Created by. Hidden by config (personRecordConfig.ts): Phone and
 * the Wise recipient ID (kept in the data), Permissions and Contracting
 * (their modules don't exist yet).
 */
function PersonFields({
  draft,
  set,
  touch,
  errors,
  formError,
  options,
  meta,
}: {
  draft: PersonDraft;
  set: <Key extends keyof PersonDraft>(key: Key, value: PersonDraft[Key]) => void;
  /** A field was left: its errors show from now on (client, 2026-10-22: "when clicking out, not on submit"). */
  touch: (key: string) => void;
  errors: Record<string, string>;
  formError: string | null;
  options?: PeopleOptions;
  meta?: { number: string; updatedAt: string; createdAt: string; lastEditedBy: string | null; createdBy: string | null; legacyFollowUp: string | null };
}) {
  const visible = (field: keyof typeof PERSON_RECORD_CONFIG) => !PERSON_RECORD_CONFIG[field].hidden;
  const channels = options?.contactChannels ?? [];
  return (
    <>
      {formError ? <StatusMessage tone="error">{formError}</StatusMessage> : null}
      <PropertyRow icon="title" label="Name" htmlFor="person-name" error={errors.name}>
        <input
          id="person-name"
          value={draft.name}
          onChange={(e) => set("name", e.target.value)}
          onBlur={() => touch("name")}
          {...invalidProps("person-name", errors.name)}
          maxLength={200}
          required
          autoComplete="off"
          placeholder="Full name"
          className={recordInput}
        />
      </PropertyRow>
      <PropertyRow icon="arrow_outward" label="Expertise" hint={LIMIT_HINTS.personExpertise} error={errors.expertise}>
        <ExpertiseField selected={draft.expertise} onChange={(next) => set("expertise", next)} limitMessage={LIMIT_HINTS.personExpertise} />
      </PropertyRow>
      <PropertyRow icon="title" label="Description" htmlFor="person-description" error={errors.description}>
        <AutoGrowTextarea id="person-description" value={draft.description} onChange={(e) => set("description", e.target.value)} maxLength={5000} placeholder="Add a description" />
      </PropertyRow>
      <PropertyRow icon="select" label="Source" error={errors.sourceKey}>
        <Pills label="Source" allowEmpty options={(options?.sources ?? []).map((source) => ({ value: source.key, label: source.label }))} value={draft.sourceKey} onChange={(value) => set("sourceKey", value)} />
      </PropertyRow>
      <PropertyRow icon="select" label="State" error={errors.stateKey}>
        <Pills label="State" allowEmpty options={(options?.states ?? []).map((state) => ({ value: state.key, label: state.label }))} value={draft.stateKey} onChange={(value) => set("stateKey", value)} />
      </PropertyRow>
      {CONTACT_FIELDS.filter(({ field }) => visible(field)).map(({ field, label, icon, placeholder, type, inputMode }) => (
        <PropertyRow key={field} icon={icon} label={label} htmlFor={`person-${field}`} error={errors[field]}>
          <input
            id={`person-${field}`}
            type={type ?? "text"}
            inputMode={inputMode}
            value={draft[field]}
            onChange={(e) => set(field, e.target.value)}
            onBlur={() => touch(field)}
            {...invalidProps(`person-${field}`, errors[field])}
            autoComplete="off"
            spellCheck={false}
            placeholder={placeholder}
            className={recordInput}
          />
        </PropertyRow>
      ))}
      <PropertyRow icon="title" label="Other contact details" htmlFor="person-otherContact" error={errors.otherContact}>
        <AutoGrowTextarea id="person-otherContact" value={draft.otherContact} onChange={(e) => set("otherContact", e.target.value)} maxLength={500} placeholder="Another way to reach them" />
      </PropertyRow>
      <PropertyRow icon="contact_channels" label="Contact channels" hint={PREFERRED_CHANNEL_HINT} error={errors.contactChannels}>
        <RelationPicker
          label="Contact channels"
          reorderable
          selected={draft.contactChannelKeys.map((key) => ({ id: key, label: channels.find((channel) => channel.key === key)?.label ?? key }))}
          onChange={(next) => set("contactChannelKeys", next.map((option) => option.id))}
          search={async (text) => channels.filter((channel) => channel.label.toLowerCase().includes(text.trim().toLowerCase())).map((channel) => ({ id: channel.key, label: channel.label }))}
        />
      </PropertyRow>
      <PropertyRow icon="check_box" label="Do not contact">
        <CheckboxField id="person-dnc" checked={draft.doNotContact} onChange={(checked) => set("doNotContact", checked)}>
          Do not contact
        </CheckboxField>
      </PropertyRow>
      <PropertyRow icon="tag" label="AI relevance score" htmlFor="person-ai-score" error={errors.aiRelevanceScore}>
        <input
          id="person-ai-score"
          inputMode="numeric"
          value={draft.aiRelevanceScore}
          onChange={(e) => set("aiRelevanceScore", e.target.value)}
          onBlur={() => touch("aiRelevanceScore")}
          {...invalidProps("person-ai-score", errors.aiRelevanceScore)}
          readOnly={options?.aiScoreReadOnly}
          title={options?.aiScoreReadOnly ? "Set automatically" : undefined}
          autoComplete="off"
          placeholder="Enter a number"
          className={recordInput}
        />
      </PropertyRow>
      <PropertyRow icon="tag" label="Relevance score" htmlFor="person-score" error={errors.relevanceScore}>
        <input
          id="person-score"
          inputMode="numeric"
          value={draft.relevanceScore}
          onChange={(e) => set("relevanceScore", e.target.value)}
          onBlur={() => touch("relevanceScore")}
          {...invalidProps("person-score", errors.relevanceScore)}
          autoComplete="off"
          placeholder="Enter a number"
          className={recordInput}
        />
      </PropertyRow>
      <PropertyRow icon="arrow_outward" label="Organizations" hint={LIMIT_HINTS.personOrganizations} error={errors.organizations}>
        <RelationPicker
          label="Organizations"
          reorderable
          selected={draft.organizations}
          onChange={(next) => set("organizations", next)}
          search={searchOrganizations}
          max={RELATION_LIMITS.organizationsPerPerson}
          limitMessage={LIMIT_HINTS.personOrganizations}
        />
      </PropertyRow>
      <PropertyRow icon="arrow_outward" label="Expenses" error={errors.expenses}>
        <RelationPicker label="Expenses" selected={draft.expenses} onChange={(next) => set("expenses", next)} search={searchExpenses} />
      </PropertyRow>
      <PropertyRow icon="calendar" label="First contact" htmlFor="person-first-contact" error={errors.firstContactOn}>
        <DateField
          id="person-first-contact"
          label="First contact"
          value={draft.firstContactOn}
          error={errors.firstContactOn}
          onChange={(value) => {
            set("firstContactOn", value);
            touch("lastContactOn");
          }}
        />
      </PropertyRow>
      <PropertyRow icon="calendar" label="Last contact" htmlFor="person-last-contact" error={errors.lastContactOn}>
        <DateField
          id="person-last-contact"
          label="Last contact"
          value={draft.lastContactOn}
          error={errors.lastContactOn}
          onChange={(value) => {
            set("lastContactOn", value);
            touch("lastContactOn");
          }}
        />
      </PropertyRow>
      <PropertyRow icon="calendar" label="Follow-up date" htmlFor="person-followup" error={errors.nextFollowupAt}>
        <DateTimeField id="person-followup" label="Follow-up date" value={draft.nextFollowupAt} error={errors.nextFollowupAt} onChange={(value) => set("nextFollowupAt", value)} />
      </PropertyRow>
      {meta ? (
        <>
          <RecordMeta numberLabel="Person ID" {...meta} />
          {meta.legacyFollowUp ? (
            // Kept from before the Follow-up date meant "next" (migration 0002): read-only.
            <PropertyRow icon="schedule" label="Last followup (legacy)">
              <ReadOnlyValue>{formatDate(meta.legacyFollowUp)}</ReadOnlyValue>
            </PropertyRow>
          ) : null}
        </>
      ) : null}
      <CompletenessRow missing={personMissing(draft)} />
    </>
  );
}
