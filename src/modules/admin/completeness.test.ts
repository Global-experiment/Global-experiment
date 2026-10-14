import { describe, expect, it } from "vitest";
import { completenessLabel, organizationMissing, personMissing } from "./completeness";

describe("completeness", () => {
  it("people: State, Source, Personal note, Expertise", () => {
    expect(personMissing({ stateKey: "", sourceKey: "", personalNote: "  ", expertise: [] })).toEqual(["State", "Source", "Personal note", "Expertise"]);
    expect(personMissing({ stateKey: "sourced", sourceKey: "ai", personalNote: "Met.", expertise: [{}] })).toEqual([]);
  });

  it("organizations: Description, Website, Email, Wise recipient ID, Expertise", () => {
    expect(organizationMissing({ description: "", website: "https://x.ch", email: "", wiseRecipientId: " ", expertise: [] })).toEqual([
      "Description",
      "Email",
      "Wise recipient ID",
      "Expertise",
    ]);
  });

  it("labels", () => {
    expect(completenessLabel([])).toBe("Complete");
    expect(completenessLabel(["State", "Expertise"])).toBe("Missing: State, Expertise");
  });
});
