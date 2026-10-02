import { describe, expect, it } from "vitest";
import { buildReportSubmission } from "./reportSubmission";

describe("buildReportSubmission", () => {
  it("carries the validated source page", () => {
    expect(
      buildReportSubmission({
        kind: "issue",
        message: "  Broken link  ",
        types: new Set(["Bug"]),
        sourcePage: "/documentation#introduction",
      }),
    ).toEqual({
      kind: "issue",
      message: "Broken link",
      types: ["Bug"],
      sourcePage: "/documentation#introduction",
    });
  });

  it("drops an external or missing source", () => {
    expect(buildReportSubmission({ kind: "feedback", message: "x", types: [], sourcePage: "https://evil.example" }).sourcePage).toBeNull();
    expect(buildReportSubmission({ kind: "feedback", message: "x", types: [], sourcePage: null }).sourcePage).toBeNull();
  });
});
