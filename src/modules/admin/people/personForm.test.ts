import { describe, expect, it } from "vitest";
import type { Person } from "../api/types";
import { draftFromPerson, fromLocalInput, hasChanges, personCreateBody, personDraftErrors, personPatch, toLocalInput } from "./personForm";

const person: Person = {
  id: "p1",
  personNumber: 7,
  notionPageId: null,
  name: "Ada Example",
  state: { key: "sourced", label: "Sourced" },
  source: null,
  personalNote: "Note",
  doNotContact: false,
  email: "ada@example.org",
  phone: null,
  website: null,
  linkedin: null,
  x: null,
  otherContact: null,
  wiseRecipientId: null,
  otherSocials: null,
  nextFollowupAt: "2026-09-01T07:00:00.000Z",
  firstContactOn: null,
  lastContactOn: null,
  aiRelevanceScore: null,
  relevanceScore: 7,
  contactChannels: [{ key: "signal", label: "Signal" }],
  expenses: [{ id: "x1", entryNumber: 204, currency: "USD", grossAmount: -20000 }],
  lastFollowupAtLegacy: "2026-08-15T09:00:00.000Z",
  followUpOverdue: false,
  archivedAt: null,
  missing: ["Source"],
  createdAt: "2026-08-01T09:00:00.000Z",
  updatedAt: "2026-08-01T09:00:00.000Z",
  organizations: [{ id: "o1", name: "Lab" }],
  expertise: [{ id: "e1", name: "Web", stableId: "03.01.web", status: { key: "active", label: "Active" }, field: { id: "f1", name: "Software" }, domain: { id: "d1", name: "Tech" } }],
};

describe("person record form", () => {
  const original = draftFromPerson(person);

  it("sends nothing when nothing changed", () => {
    expect(hasChanges(personPatch(original, { ...original }))).toBe(false);
    expect(hasChanges(personPatch(original, { ...original, name: " Ada Example " }))).toBe(false);
  });

  it("sends only the changed fields, clearing blanks to null", () => {
    expect(
      personPatch(original, { ...original, stateKey: "contacted", personalNote: "  ", phone: " +41 1 ", sourceKey: "" }),
    ).toEqual({ stateKey: "contacted", personalNote: null, phone: "+41 1" });
  });

  it("sends relationship sets only when membership changed (order ignored)", () => {
    const reordered = { ...original, organizations: [...original.organizations].reverse() };
    expect(personPatch(original, reordered)).toEqual({});
    expect(personPatch(original, { ...original, organizations: [], expertise: [...original.expertise, { id: "e2", label: "Backend" }] })).toEqual({
      organizationIds: [],
      expertiseIds: ["e1", "e2"],
    });
  });

  it("edits the follow-up as a date and time in the viewer's time zone and sends the instant, or clears it", () => {
    // The test runner's time zone is the viewer's: whatever it is, the round trip keeps the instant.
    expect(fromLocalInput(original.nextFollowupAt)).toBe("2026-09-01T07:00:00.000Z");
    const local = toLocalInput("2026-10-02T13:30:00.000Z");
    expect(personPatch(original, { ...original, nextFollowupAt: local })).toEqual({ nextFollowupAt: "2026-10-02T13:30:00.000Z" });
    expect(personPatch(original, { ...original, nextFollowupAt: "" })).toEqual({ nextFollowupAt: null });
  });

  it("scores: whole numbers 0–10 or empty, checked before sending", () => {
    expect(original.relevanceScore).toBe("7");
    expect(personPatch(original, { ...original, relevanceScore: "8", aiRelevanceScore: "0" })).toEqual({ relevanceScore: 8, aiRelevanceScore: 0 });
    expect(personPatch(original, { ...original, relevanceScore: " " })).toEqual({ relevanceScore: null });
    for (const typed of ["11", "-1", "2.5", "a"]) expect(personDraftErrors({ ...original, relevanceScore: typed }), typed).toEqual({ relevanceScore: "Use a whole number from 0 to 10." });
    expect(personDraftErrors({ ...original, firstContactOn: "2026-10-05", lastContactOn: "2026-10-01" })).toEqual({ lastContactOn: "The last contact can't be before the first contact." });
    expect(personDraftErrors(original)).toEqual({});
  });

  it("contact channels and expenses are sets: sent only when membership changed", () => {
    expect(original.expenses).toEqual([{ id: "x1", label: "EXP-204 · \u2212USD\u00a0200.00", href: "/admin/treasury/x1" }]);
    expect(personPatch(original, { ...original, contactChannelKeys: ["signal"] })).toEqual({});
    expect(personPatch(original, { ...original, contactChannelKeys: ["email", "signal"], expenses: [] })).toEqual({ contactChannelKeys: ["email", "signal"], expenseIds: [] });
  });

  it("a duplicate as a draft sends every filled field, but never the expenses (they keep their recipient)", () => {
    const body = personCreateBody({ ...original, name: "Ada Example (copy)" });
    expect(body).toMatchObject({ name: "Ada Example (copy)", stateKey: "sourced", personalNote: "Note", email: "ada@example.org", relevanceScore: 7, contactChannelKeys: ["signal"], organizationIds: ["o1"], expertiseIds: ["e1"] });
    expect(body).not.toHaveProperty("expenseIds");
  });

  it("treats the Wise recipient ID as free text", () => {
    expect(personPatch(original, { ...original, wiseRecipientId: "  12345678 " })).toEqual({ wiseRecipientId: "12345678" });
    expect(personPatch({ ...original, wiseRecipientId: "x" }, { ...original, wiseRecipientId: "" })).toEqual({ wiseRecipientId: null });
  });

  it("never sends the read-only legacy follow-up value", () => {
    expect(Object.keys(original)).not.toContain("lastFollowupAtLegacy");
  });
});
