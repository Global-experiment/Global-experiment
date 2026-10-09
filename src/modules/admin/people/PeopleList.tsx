"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { adminApi, AdminApiError } from "../api/client";
import type { ExpertiseTree, Organization, Page, PeopleOptions, Person } from "../api/types";
import { useAdminData } from "../api/useAdminData";
import { AdminListPage } from "../table/AdminListPage";
import { AdminIcon } from "../ui/adminIcons";
import { AdminButton, chipInput, Popover } from "../ui/controls";
import { useToast } from "../ui/Toast";
import { NotionImportControl } from "./NotionImportControl";
import { PEOPLE_COLUMNS, PEOPLE_DEFAULT_SORT, peopleFields } from "./peopleTable";

/**
 * Figma's saved-view tabs (p40). Only "All" has a defined meaning; what
 * Sourcing / Discussions / Contributors / Collaborators and the "+3" views
 * filter on is an open client decision, so they're shown but inert rather
 * than guessed.
 */
function Views() {
  const pending = ["Sourcing", "Discussions", "Contributors", "Collaborators"];
  return (
    <ul aria-label="Views" className="flex shrink-0 items-center gap-4 text-body whitespace-nowrap">
      <li>
        <span aria-current="true" className="flex items-center gap-1 text-text-primary">
          <AdminIcon name="view_all" />
          All
        </span>
      </li>
      {pending.map((view) => (
        <li key={view}>
          <span aria-disabled="true" title="View definition pending client decision" className="flex items-center gap-1 text-text-muted">
            <AdminIcon name="view_column" />
            {view}
          </span>
        </li>
      ))}
      <li>
        <span aria-disabled="true" title="Views pending client decision" className="text-text-muted">
          +3
        </span>
      </li>
    </ul>
  );
}

function NewPersonControl() {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const person = await adminApi<Person>("/people", { method: "POST", body: { name } });
      toast("Person created");
      router.push(`/admin/people/${person.id}`);
    } catch (caught) {
      setError(caught instanceof AdminApiError ? (caught.issues[0]?.message ?? caught.message) : "Couldn't create the person.");
      setSaving(false);
    }
  }

  return (
    <div className="relative">
      <AdminButton ref={trigger} icon="add" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        New people
      </AdminButton>
      <Popover open={open} onClose={() => setOpen(false)} triggerRef={trigger} label="New person" className="top-[calc(100%+8px)] right-0 w-80 p-3">
        <form onSubmit={create} className="flex flex-col gap-2">
          <label htmlFor="new-person-name" className="text-text-muted">
            Name
          </label>
          <input
            id="new-person-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={200}
            required
            autoComplete="off"
            className={chipInput}
          />
          {error ? (
            <p role="alert" className="text-text-primary">
              {error}
            </p>
          ) : null}
          <AdminButton type="submit" icon="add" disabled={saving || name.trim() === ""} className="self-start">
            Create
          </AdminButton>
        </form>
      </Popover>
    </div>
  );
}

/** /admin/people — PostgreSQL → NestJS → this table; nothing here is hardcoded data. */
export function PeopleList() {
  const options = useAdminData<PeopleOptions>("/people/options");
  const organizations = useAdminData<Page<Organization>>("/organizations?pageSize=100&sort=name:asc");
  const tree = useAdminData<ExpertiseTree>("/expertise/tree");
  const fields = useMemo(
    () => peopleFields(options.data, organizations.data?.items, tree.data),
    [options.data, organizations.data, tree.data],
  );

  return (
    <AdminListPage<Person>
      config={{
        title: "People",
        noun: "people",
        tableId: "people",
        endpoint: "/people",
        defaultSort: PEOPLE_DEFAULT_SORT,
        fields,
        columns: PEOPLE_COLUMNS,
        recordHref: (person) => `/admin/people/${person.id}`,
        views: <Views />,
        actions: (
          <>
            <NotionImportControl />
            <NewPersonControl />
          </>
        ),
      }}
    />
  );
}
