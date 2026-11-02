import { describe, expect, it } from "vitest";
import { historyHeadline, historyPageHeadline } from "../record/historyText";
import { grantName } from "./GrantRecord";

describe("permission names and their history (OPS-138, OPS-151)", () => {
  it("names a permission Service / Account / Permission level, the level capitalised, a missing part left out", () => {
    expect(grantName("ChatGPT", "Candide", "owner")).toBe("ChatGPT / Candide / Owner");
    expect(grantName("GitHub", null, "read")).toBe("GitHub / Read");
    expect(grantName(null, null, null)).toBe("");
  });

  it("says who got which level on which service, in one event", () => {
    const item = { action: "access_granted" as const, changes: [], meta: { account: "Stanley", level: "Superadmin", service: "GitHub" } };
    expect(historyHeadline(item, "permission")).toBe("granted Stanley Superadmin on GitHub");
    // Monitoring → History links the service to the permission.
    expect(historyPageHeadline(item, "permission")).toEqual({ before: "granted Stanley Superadmin on", after: "" });
    // Events from before OPS-151 keep their wording.
    expect(historyHeadline({ action: "access_granted", changes: [], meta: {} })).toBe("granted access");
  });

  it("names an invitation link created or revoked (OPS-141)", () => {
    expect(historyHeadline({ action: "link_revoked", changes: [] })).toBe("revoked a one-time link");
    expect(historyPageHeadline({ action: "link_revoked", changes: [] }, "invitation link")).toEqual({ before: "revoked", after: "" });
    expect(historyPageHeadline({ action: "link_created", changes: [] }, "invitation link")).toEqual({ before: "created", after: "" });
    expect(historyPageHeadline({ action: "link_created", changes: [] }, "account")).toEqual({ before: "created a one-time link for", after: "" });
  });
});
