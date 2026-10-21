"use client";

import { Timestamp } from "@/shared/format/Timestamp";
import { PersonChip, PropertyRow, ReadOnlyValue } from "../ui/RecordForm";

/**
 * The read-only rows that close every record (prototype p14): the record's
 * number, Updated, Last edited by, Created, Created by. The editors come
 * from the history; "Not recorded" for changes made before it existed.
 */
export function RecordMeta({
  numberLabel,
  number,
  updatedAt,
  createdAt,
  lastEditedBy,
  createdBy,
}: {
  numberLabel: string;
  number: string;
  updatedAt: string;
  createdAt: string;
  lastEditedBy: string | null;
  createdBy: string | null;
}) {
  return (
    <>
      <PropertyRow icon="badge" label={numberLabel}>
        <ReadOnlyValue>{number}</ReadOnlyValue>
      </PropertyRow>
      <PropertyRow icon="schedule" label="Updated">
        <ReadOnlyValue>
          <Timestamp value={updatedAt} format="full" />
        </ReadOnlyValue>
      </PropertyRow>
      <PropertyRow icon="person" label="Last edited by">
        {lastEditedBy ? <PersonChip name={lastEditedBy} /> : <ReadOnlyValue>Not recorded</ReadOnlyValue>}
      </PropertyRow>
      <PropertyRow icon="schedule" label="Created">
        <ReadOnlyValue>
          <Timestamp value={createdAt} format="full" />
        </ReadOnlyValue>
      </PropertyRow>
      <PropertyRow icon="person" label="Created by">
        {createdBy ? <PersonChip name={createdBy} /> : <ReadOnlyValue>Not recorded</ReadOnlyValue>}
      </PropertyRow>
    </>
  );
}
