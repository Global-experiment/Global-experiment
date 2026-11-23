import { describe, expect, it } from "vitest";
import { buildReportSubmission } from "./reportSubmission";

describe("buildReportSubmission", () => {
  it("carries the trimmed text, the types as the API's keys, the validated source page and the language", () => {
    expect(
      buildReportSubmission({
        kind: "issue",
        message: "  Broken link  ",
        types: new Set(["Broken link", "Crash"]),
        sourcePage: "/documentation#introduction",
        locale: "en-GB",
      }),
    ).toEqual({
      kind: "issue",
      message: "Broken link",
      // The kind's own order, whatever the order picked.
      types: ["crash", "broken_link"],
      sourcePage: "/documentation#introduction",
      locale: "en-GB",
    });
  });

  it("drops types of the other kind or unknown, an external or missing source, and a language that isn't one", () => {
    const draft = buildReportSubmission({
      kind: "feedback",
      message: "x",
      types: ["Crash", "Bug", "Praise"],
      sourcePage: "https://evil.example",
      locale: "not a tag",
    });
    expect(draft).toMatchObject({ types: ["praise"], sourcePage: null, locale: null });
    expect(buildReportSubmission({ kind: "feedback", message: "x", types: [], sourcePage: null }).locale).toBeNull();
  });
});
