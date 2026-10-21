import { describe, expect, it } from "vitest";
import type { HistoryChange } from "../api/types";
import { historyHeadline, relationDiff, shortUrl } from "./historyText";

const text = (field: string, before: string | null, after: string | null, extra: Partial<HistoryChange> = {}): HistoryChange => ({ field, label: field[0]!.toUpperCase() + field.slice(1), kind: "text", before, after, ...extra });
const relation = (field: string, label: string, before: string[], after: string[]): HistoryChange => ({
  field,
  label,
  kind: "relation",
  before: before.map((id) => ({ id, label: id })),
  after: after.map((id) => ({ id, label: id })),
});
const headline = (changes: HistoryChange[]) => historyHeadline({ action: "updated", changes });

describe("history headlines (person-record prototype)", () => {
  it("one Submit with several fields: 'updated N fields'", () => {
    expect(headline([text("name", "Stanley Q.", "Stanley Qiang"), text("website", "a", "b"), text("personalNote", "x", "y", { privacy: "private_note" })])).toBe("updated 3 fields");
  });

  it("contact details only: 'updated contact details'", () => {
    expect(headline([text("email", "s•••@example.org", "s•••@example.net", { privacy: "contact", masked: true })])).toBe("updated contact details");
    expect(headline([text("email", "a", "b", { privacy: "contact" }), text("phone", null, "+•••", { privacy: "contact" })])).toBe("updated contact details");
  });

  it("the private note alone: 'edited a note'", () => {
    expect(headline([text("personalNote", null, null, { privacy: "private_note", redacted: true })])).toBe("edited a note");
  });

  it("one field added or cleared", () => {
    expect(headline([{ ...text("website", null, "https://workana.com"), label: "Website", kind: "url" }])).toBe("added a website");
    expect(headline([{ ...text("email", null, "x"), label: "Email" }])).toBe("added an email");
    expect(headline([{ ...text("otherSocials", "https://previous.example", null), label: "Other socials" }])).toBe("cleared a field");
    expect(headline([text("name", "Ada", "Ada L.")])).toBe("updated name");
  });

  it("relations: linked, unlinked, replaced", () => {
    expect(headline([relation("expenses", "Expenses", [], ["EXP-204"])])).toBe("linked an expense");
    expect(headline([relation("contracts", "Contracting", [], ["CON-18"])])).toBe("linked a contract");
    expect(headline([relation("organizations", "Organizations", ["o1"], [])])).toBe("unlinked an organization");
    expect(headline([relation("organizations", "Organizations", ["o1"], ["o2"])])).toBe("replaced a relation");
    expect(relationDiff(relation("expertise", "Expertise", ["a", "b"], ["b", "c"]))).toEqual({ removed: [{ id: "a", label: "a" }], added: [{ id: "c", label: "c" }] });
  });

  it("publication changes read as published / unpublished", () => {
    const publication = (from: string, to: string): HistoryChange => ({ field: "publication", label: "Publication", kind: "select", before: { key: from, label: from }, after: { key: to, label: to } });
    expect(historyHeadline({ action: "updated", changes: [publication("unpublished", "published")] }, "entry")).toBe("published this entry");
    expect(historyHeadline({ action: "updated", changes: [publication("published", "unpublished")] }, "entry")).toBe("unpublished this entry");
  });

  it("every other event type", () => {
    const of = (action: Parameters<typeof historyHeadline>[0]["action"]) => historyHeadline({ action, changes: [] });
    expect(of("created")).toBe("created this record");
    expect(of("imported")).toBe("imported this record");
    expect(of("duplicated")).toBe("duplicated a record");
    expect(of("archived")).toBe("archived this record");
    expect(of("restored")).toBe("restored this record");
    expect(of("deleted")).toBe("deleted this record");
    expect(of("comment_added")).toBe("left a comment");
    expect(of("comment_edited")).toBe("edited a comment");
    expect(of("comment_deleted")).toBe("deleted a comment");
    expect(of("viewed")).toBe("viewed this page");
    expect(historyHeadline({ action: "duplicated", changes: [] }, "entry")).toBe("duplicated an entry");
  });

  it("URLs without their protocol", () => {
    expect(shortUrl("https://workana.com/")).toBe("workana.com");
    expect(shortUrl("http://stanley.example/about")).toBe("stanley.example/about");
  });
});
