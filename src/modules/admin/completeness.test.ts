import { describe, expect, it } from "vitest";
import { completenessLabel, organizationMissing, personMissing } from "./completeness";

describe("completeness", () => {
  it("people: State, Source, Description, Expertise", () => {
    expect(personMissing({ stateKey: "", sourceKey: "", description: "  ", expertise: [] })).toEqual(["State", "Source", "Description", "Expertise"]);
    expect(personMissing({ stateKey: "sourced", sourceKey: "ai", description: "Met.", expertise: [{}] })).toEqual([]);
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
