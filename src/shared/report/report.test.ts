import { afterEach, describe, expect, it, vi } from "vitest";
import { composerContextFromSearch, composerHref } from "./reportLinks";
import {
  clearReportDraft,
  parseReportDraft,
  readReportDraftRaw,
  reportDraftKey,
  serializeReportDraft,
  writeReportDraft,
} from "./reportDraft";
import { knownTypes, reportKindForHref } from "./reportKinds";

describe("report qualification links", () => {
  it("carries the sanitized source and selected types to the composer", () => {
    const href = composerHref("issue", "/documentation#introduction", ["Crash", "Visual bug"]);
    expect(href).toBe("/issue?source=%2Fdocumentation%23introduction&qualified=1&type=Visual+bug&type=Crash");
    const context = composerContextFromSearch("issue", href.slice(href.indexOf("?")));
    expect(context).toEqual({ sourcePage: "/documentation#introduction", qualified: true, types: ["Visual bug", "Crash"] });
  });

  it("marks a zero-type qualification as qualified", () => {
    const href = composerHref("feedback", "/treasury", []);
    expect(composerContextFromSearch("feedback", href.slice(href.indexOf("?")))).toEqual({
      sourcePage: "/treasury",
      qualified: true,
      types: [],
    });
  });

  it("never carries an external source, and drops unknown or foreign types", () => {
    expect(composerHref("feedback", "https://evil.example/x", ["Praise"])).toBe("/feedback?qualified=1&type=Praise");
    expect(composerHref("feedback", "/treasury", ["Crash", "<script>"])).toBe("/feedback?source=%2Ftreasury&qualified=1");
    expect(composerContextFromSearch("issue", "?type=Crash")).toEqual({ sourcePage: null, qualified: false, types: ["Crash"] });
  });

  it("maps plain report hrefs to kinds", () => {
    expect(reportKindForHref("/feedback")).toBe("feedback");
    expect(reportKindForHref("/issue")).toBe("issue");
    expect(reportKindForHref("/documentation")).toBeUndefined();
    expect(knownTypes("feedback", ["Praise", "Praise", "Enhancement"])).toEqual(["Enhancement", "Praise"]);
  });
});

describe("report session drafts", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keys drafts by kind and sanitized source page", () => {
    expect(reportDraftKey("issue", "/documentation#introduction")).toBe("ge-report-draft:v1:issue:/documentation#introduction");
    expect(reportDraftKey("feedback", "/documentation#introduction")).not.toBe(reportDraftKey("issue", "/documentation#introduction"));
    expect(reportDraftKey("issue", "https://evil.example")).toBe("ge-report-draft:v1:issue:");
    expect(reportDraftKey("issue", null)).toBe("ge-report-draft:v1:issue:");
  });

  it("round-trips and parses defensively", () => {
    const raw = serializeReportDraft({ message: "Broken link on Introduction", types: ["Broken link"] });
    expect(parseReportDraft("issue", raw)).toEqual({ message: "Broken link on Introduction", types: ["Broken link"] });
    expect(parseReportDraft("issue", null)).toBeNull();
    expect(parseReportDraft("issue", "not json")).toBeNull();
    expect(parseReportDraft("issue", '{"message":42}')).toBeNull();
    expect(parseReportDraft("feedback", raw)).toEqual({ message: "Broken link on Introduction", types: [] });
  });

  it("stores in sessionStorage, removes empty drafts, and survives unavailable storage", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => void store.set(key, value),
        removeItem: (key: string) => void store.delete(key),
      },
    });
    const key = reportDraftKey("feedback", "/treasury");
    writeReportDraft(key, { message: "Nice charts", types: ["Praise"] });
    expect(parseReportDraft("feedback", readReportDraftRaw(key))).toEqual({ message: "Nice charts", types: ["Praise"] });
    writeReportDraft(key, { message: "   ", types: [] });
    expect(readReportDraftRaw(key)).toBeNull();
    writeReportDraft(key, { message: "Again", types: [] });
    clearReportDraft(key);
    expect(store.size).toBe(0);

    vi.stubGlobal("window", {
      get sessionStorage(): Storage {
        throw new Error("SecurityError");
      },
    });
    expect(() => writeReportDraft(key, { message: "x", types: [] })).not.toThrow();
    expect(readReportDraftRaw(key)).toBeNull();
  });
});
