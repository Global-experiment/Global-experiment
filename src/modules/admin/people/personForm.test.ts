import { describe, expect, it } from "vitest";
import type { Person } from "../api/types";
import { draftFromPerson, hasChanges, personPatch } from "./personForm";

const person: Person = {
  id: "p1",
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
  lastFollowupAt: "2026-09-01T09:00:00.000Z",
  createdAt: "2026-08-01T09:00:00.000Z",
  updatedAt: "2026-08-01T09:00:00.000Z",
  organizations: [{ id: "o1", name: "Lab" }],
  expertise: [{ id: "e1", name: "Web", field: { id: "f1", name: "Software" }, domain: { id: "d1", name: "Tech" } }],
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

  it("converts the follow-up date to a UTC timestamp, or clears it", () => {
    expect(original.lastFollowupDate).toBe("2026-09-01");
    expect(personPatch(original, { ...original, lastFollowupDate: "2026-10-02" })).toEqual({ lastFollowupAt: "2026-10-02T00:00:00.000Z" });
    expect(personPatch(original, { ...original, lastFollowupDate: "" })).toEqual({ lastFollowupAt: null });
  });
});
