import { adminApi } from "../api/client";
import type { Organization, Page, Person, TreasuryEntry, VocabularyEntry } from "../api/types";
import type { RelationOption } from "../ui/RelationPicker";

/**
 * The expense detail page's editable fields (OPS-155): what the Rootadmin
 * types, turned into what the API takes (minor units, an expense's amount
 * below zero, the recipient as a person or an organization).
 */

/** A recipient option's id carries its kind: "person:<id>" or "organization:<id>". */
export const recipientOption = (recipient: NonNullable<TreasuryEntry["recipient"]>): RelationOption => ({
  id: `${recipient.kind}:${recipient.id}`,
  label: recipient.name,
  detail: recipient.kind === "person" ? "Person" : "Organization",
  href: `/admin/${recipient.kind === "person" ? "people" : "organizations"}/${recipient.id}`,
});

export function recipientFromOption(option: RelationOption | undefined): { kind: "person" | "organization"; id: string } | null {
  if (!option) return null;
  const [kind, id] = option.id.split(":");
  return kind === "person" || kind === "organization" ? { kind, id: id! } : null;
}

/** People and organizations matching the text, people first (read-only lists; directory.read). */
export async function searchRecipients(text: string, signal: AbortSignal): Promise<RelationOption[]> {
  const query = new URLSearchParams({ pageSize: "10", sort: "name:asc" });
  if (text.trim()) query.set("search", text.trim());
  const [people, organizations] = await Promise.all([
    adminApi<Page<Person>>(`/people?${query}`, { signal }),
    adminApi<Page<Organization>>(`/organizations?${query}`, { signal }),
  ]);
  return [
    ...people.items.map((person) => recipientOption({ kind: "person", id: person.id, name: person.name })),
    ...organizations.items.map((organization) => recipientOption({ kind: "organization", id: organization.id, name: organization.name })),
  ];
}

export const typeOption = (type: VocabularyEntry): RelationOption => ({ id: type.key, label: type.label });

/** The expense types matching the text (the vocabulary is small: filtered here). */
export const searchTypes = (types: readonly VocabularyEntry[]) => async (text: string) => {
  const needle = text.trim().toLowerCase();
  return types.filter((type) => !needle || type.label.toLowerCase().includes(needle)).map(typeOption);
};

/** "1200.50" for -120050: what the amount field shows (no sign, no thousands separator). */
export const toAmountText = (minor: number | null) => (minor === null ? "" : (Math.abs(minor) / 100).toFixed(2));

/**
 * Minor units from what was typed ("1,200.5", "1200.50", "€ 1 200"), or an error.
 * Up to 2 decimals; thousands separators and spaces are ignored.
 */
export function parseAmount(text: string, { allowEmpty }: { allowEmpty: boolean }): { minor: number | null } | { error: string } {
  const cleaned = text.replace(/[\s,'€$]/g, "").replace(/^CHF|^USD|^EUR/i, "");
  if (cleaned === "") return allowEmpty ? { minor: null } : { error: "Enter the amount." };
  if (!/^\d{1,13}(\.\d{1,2})?$/.test(cleaned)) return { error: "Enter an amount like 1200.50." };
  const [whole, decimals = ""] = cleaned.split(".");
  return { minor: Number(whole) * 100 + Number(decimals.padEnd(2, "0")) };
}
