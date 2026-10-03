"use client";

import { useState } from "react";
import { adminApi, AdminApiError } from "../api/client";
import type { ExpertiseTree } from "../api/types";
import { useAdminData } from "../api/useAdminData";
import { AdminIcon } from "../ui/adminIcons";
import { AdminButton, chipInput, ChipSelect, focusRing, StatusMessage } from "../ui/controls";
import { useToast } from "../ui/Toast";

export type TaxonomyLevel = "domain" | "field" | "expertise";

interface Row {
  id: string;
  name: string;
  cells: (string | number)[];
  /** Why it can't be deleted, if anything depends on it. */
  inUse?: string;
}

const CONFIG = {
  domain: { title: "Domains", noun: "domain", path: "domains", columns: ["Fields", "Expertise"] },
  field: { title: "Fields", noun: "field", path: "fields", columns: ["Domain", "Expertise"] },
  expertise: { title: "Expertise", noun: "expertise", path: "items", columns: ["Field", "Domain", "People", "Organizations"] },
} as const;

function rowsFor(level: TaxonomyLevel, tree: ExpertiseTree): Row[] {
  if (level === "domain") {
    return tree.domains.map((domain) => {
      const items = domain.fields.reduce((sum, field) => sum + field.items.length, 0);
      return { id: domain.id, name: domain.name, cells: [domain.fields.length, items], inUse: domain.fields.length > 0 ? "Has fields" : undefined };
    });
  }
  if (level === "field") {
    return tree.domains.flatMap((domain) =>
      domain.fields.map((field) => ({
        id: field.id,
        name: field.name,
        cells: [domain.name, field.items.length],
        inUse: field.items.length > 0 ? "Has expertise" : undefined,
      })),
    );
  }
  return tree.domains.flatMap((domain) =>
    domain.fields.flatMap((field) =>
      field.items.map((item) => ({
        id: item.id,
        name: item.name,
        cells: [field.name, domain.name, item.peopleCount, item.organizationCount],
        inUse: item.peopleCount + item.organizationCount > 0 ? "Assigned to people or organizations" : undefined,
      })),
    ),
  );
}

/**
 * /admin/domains, /admin/fields, /admin/expertise — the native Domain →
 * Field → Expertise taxonomy. No Figma frame exists for these screens, so
 * they reuse the People table's look and stay minimal: add, rename, and
 * delete only what nothing depends on (the API enforces the same rule).
 */
export function TaxonomyScreen({ level }: { level: TaxonomyLevel }) {
  const config = CONFIG[level];
  const toast = useToast();
  const tree = useAdminData<ExpertiseTree>("/expertise/tree");
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const parents =
    level === "field"
      ? (tree.data?.domains ?? []).map((domain) => ({ group: "", id: domain.id, label: domain.name }))
      : level === "expertise"
        ? (tree.data?.domains ?? []).flatMap((domain) => domain.fields.map((field) => ({ group: domain.name, id: field.id, label: field.name })))
        : [];
  const effectiveParent = parentId || parents[0]?.id || "";

  async function run(action: () => Promise<unknown>, message: string) {
    setBusy(true);
    setError(null);
    try {
      await action();
      tree.reload();
      toast(message);
      return true;
    } catch (caught) {
      setError(caught instanceof AdminApiError ? (caught.status === 409 && caught.code === "conflict" ? `${caught.message}` : (caught.issues[0]?.message ?? caught.message)) : "Something went wrong.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add(event: React.FormEvent) {
    event.preventDefault();
    const body = level === "domain" ? { name } : level === "field" ? { name, domainId: effectiveParent } : { name, fieldId: effectiveParent };
    if (await run(() => adminApi(`/expertise/${config.path}`, { method: "POST", body }), `${config.title} updated`)) setName("");
  }

  const rows = tree.data ? rowsFor(level, tree.data) : [];

  return (
    <main>
      <header className="flex h-10 items-center px-2">
        <h1 className="text-body font-bold">{config.title}</h1>
      </header>

      <form onSubmit={add} className="flex h-10 items-center gap-2 px-2" aria-label={`New ${config.noun}`}>
        <input
          aria-label={`New ${config.noun} name`}
          placeholder={`New ${config.noun}`}
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={120}
          autoComplete="off"
          className={`${chipInput} w-60`}
        />
        {level !== "domain" ? (
          <ChipSelect aria-label={level === "field" ? "Domain" : "Field"} value={effectiveParent} onChange={(event) => setParentId(event.target.value)}>
            {level === "field"
              ? parents.map((parent) => (
                  <option key={parent.id} value={parent.id}>
                    {parent.label}
                  </option>
                ))
              : [...new Set(parents.map((parent) => parent.group))].map((group) => (
                  <optgroup key={group} label={group}>
                    {parents
                      .filter((parent) => parent.group === group)
                      .map((parent) => (
                        <option key={parent.id} value={parent.id}>
                          {parent.label}
                        </option>
                      ))}
                  </optgroup>
                ))}
          </ChipSelect>
        ) : null}
        <AdminButton type="submit" icon="add" disabled={busy || name.trim() === "" || (level !== "domain" && !effectiveParent)}>
          Add
        </AdminButton>
      </form>

      {error ? (
        <div className="px-2">
          <StatusMessage tone="error">{error}</StatusMessage>
        </div>
      ) : null}

      {tree.error ? (
        <div className="px-2">
          <StatusMessage tone="error">{tree.error.message}</StatusMessage>
          <AdminButton onClick={tree.reload}>Retry</AdminButton>
        </div>
      ) : !tree.data ? (
        <StatusMessage>Loading {config.title.toLowerCase()}…</StatusMessage>
      ) : rows.length === 0 ? (
        <StatusMessage>No {config.title.toLowerCase()} yet.</StatusMessage>
      ) : (
        <table className="w-full table-fixed border-separate border-spacing-0 text-body">
          <caption className="sr-only">{config.title}</caption>
          <thead>
            <tr>
              {["Name", ...config.columns, ""].map((label, index) => (
                <th key={`${label}-${index}`} scope="col" className={`h-[33px] px-1 pb-[3px] text-left align-bottom font-normal text-text-muted ${index === 0 ? "w-[280px]" : label ? "" : "w-[200px]"}`}>
                  {label ? (
                    <span className="flex items-center gap-1">
                      <AdminIcon name={index === 0 ? "title" : "arrow_outward"} />
                      {label}
                    </span>
                  ) : (
                    <span className="sr-only">Actions</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="border-t border-line px-1 py-1 align-top">
                  {renaming?.id === row.id ? (
                    <form
                      onSubmit={async (event) => {
                        event.preventDefault();
                        if (await run(() => adminApi(`/expertise/${config.path}/${row.id}`, { method: "PATCH", body: { name: renaming.name } }), `${config.title} updated`)) {
                          setRenaming(null);
                        }
                      }}
                      className="flex items-center gap-2"
                    >
                      <input
                        aria-label={`Rename ${row.name}`}
                        value={renaming.name}
                        onChange={(event) => setRenaming({ id: row.id, name: event.target.value })}
                        maxLength={120}
                        autoFocus
                        className={`${chipInput} min-w-0 flex-1`}
                      />
                      <AdminButton type="submit" disabled={busy || renaming.name.trim() === ""}>
                        Save
                      </AdminButton>
                    </form>
                  ) : (
                    row.name
                  )}
                </td>
                {row.cells.map((cell, index) => (
                  <td key={index} className="border-t border-l border-line px-1 py-1 align-top">
                    {cell}
                  </td>
                ))}
                <td className="border-t border-l border-line px-1 py-1 align-top">
                  <span className="flex gap-2">
                    {renaming?.id === row.id ? (
                      <button type="button" onClick={() => setRenaming(null)} className={`cursor-pointer text-text-muted ${focusRing}`}>
                        Cancel
                      </button>
                    ) : (
                      <button type="button" onClick={() => setRenaming({ id: row.id, name: row.name })} className={`cursor-pointer text-text-muted underline underline-offset-2 ${focusRing}`}>
                        Rename
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busy || row.inUse !== undefined}
                      title={row.inUse ? `Can't delete: ${row.inUse.toLowerCase()}` : undefined}
                      onClick={() => {
                        if (window.confirm(`Delete “${row.name}”?`)) {
                          void run(() => adminApi(`/expertise/${config.path}/${row.id}`, { method: "DELETE" }), `${config.title} updated`);
                        }
                      }}
                      className={`cursor-pointer text-text-muted underline underline-offset-2 disabled:cursor-not-allowed disabled:no-underline disabled:opacity-50 ${focusRing}`}
                    >
                      Delete
                    </button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
