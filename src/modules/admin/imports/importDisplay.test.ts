import { describe, expect, it } from "vitest";
import type { ImportJob } from "../api/types";
import { canApply, jobLine, runChanges, runKindLabel } from "./importDisplay";

const job = (extra: Partial<ImportJob>): ImportJob => ({
  id: "j",
  kind: "taxonomy",
  mode: "dry_run",
  status: "running",
  phase: "reading_notion",
  startedAt: "2026-10-14T10:00:00.000Z",
  finishedAt: null,
  triggeredBy: "admin:owner@ngo.ch",
  runId: null,
  dryRunId: null,
  changes: null,
  applicable: false,
  report: null,
  error: null,
  ...extra,
});

describe("import page display", () => {
  it("describes progress and outcomes", () => {
    expect(jobLine(job({}))).toBe("Taxonomy dry run: Reading Notion…");
    expect(jobLine(job({ mode: "apply", phase: "applying" }))).toBe("Taxonomy apply: Writing to the database (one transaction)…");
    expect(jobLine(job({ status: "succeeded", phase: "done", changes: 1 }))).toBe("Taxonomy dry run finished: 1 change.");
    expect(jobLine(job({ kind: "directory", status: "succeeded", phase: "done", changes: 0 }))).toBe("People & organizations dry run finished: no changes.");
    expect(jobLine(job({ status: "refused", error: "Notion changed." }))).toBe("Taxonomy dry run refused: Notion changed.");
  });

  it("offers Apply only for a finished, applicable dry run", () => {
    expect(canApply(null)).toBe(false);
    expect(canApply(job({}))).toBe(false); // still running
    expect(canApply(job({ status: "succeeded", phase: "done", runId: "r", applicable: false }))).toBe(false); // nothing to write / demo-only
    expect(canApply(job({ mode: "apply", status: "succeeded", runId: "r", applicable: true }))).toBe(false);
    expect(canApply(job({ status: "succeeded", phase: "done", runId: "r", applicable: true }))).toBe(true);
  });

  it("summarises history rows", () => {
    expect(runKindLabel("directory")).toBe("People & organizations");
    expect(runKindLabel("treasury")).toBe("Treasury expenses");
    expect(runKindLabel("cms")).toBe("cms");
    expect(runChanges({ counts: { changes: 12 } } as never)).toBe("12");
    expect(runChanges({ counts: {} } as never)).toBe("—");
  });
});
