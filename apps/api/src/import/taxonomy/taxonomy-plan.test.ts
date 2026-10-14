import { describe, expect, it } from "vitest";
import { cleanStableId, countPlan, planTaxonomyImport, type DbNode, type DbSnapshot } from "./taxonomy-plan.js";
import type { SourceRow, TaxonomySource } from "./taxonomy-source.js";

// Test fixtures only (never written to a non-test database).
let clock = 0;
const row = (level: SourceRow["level"], pageId: string, name: string, rawStableId: string, extra: Partial<SourceRow> = {}): SourceRow => ({
  level,
  pageId,
  createdTime: `2026-09-25T00:00:${String(clock++ % 60).padStart(2, "0")}.000Z`,
  name,
  rawStableId,
  status: "Active",
  parentPageIds: [],
  teams: [],
  ...extra,
});
const domain = (pageId: string, name: string, stable: string, extra?: Partial<SourceRow>) => row("domain", pageId, name, stable, extra);
const field = (pageId: string, name: string, stable: string, parent: string, extra?: Partial<SourceRow>) => row("field", pageId, name, stable, { parentPageIds: [parent], ...extra });
const item = (pageId: string, name: string, stable: string, parent: string, extra?: Partial<SourceRow>) => row("expertise", pageId, name, stable, { parentPageIds: [parent], ...extra });

const VOCABULARY = {
  statuses: [
    { key: "active", label: "Active" },
    { key: "proposed", label: "Proposed" },
    { key: "deprecated", label: "Deprecated" },
  ],
  teams: [
    { key: "communication", label: "Communication" },
    { key: "tech", label: "Tech" },
    { key: "treasury", label: "Treasury" },
  ],
};
const empty: DbSnapshot = { nodes: [], ...VOCABULARY };
const snapshot = (nodes: DbNode[]): DbSnapshot => ({ nodes, ...VOCABULARY });
const node = (level: DbNode["level"], id: string, name: string, extra: Partial<DbNode> = {}): DbNode => ({
  level,
  id,
  name,
  stableId: null,
  statusKey: null,
  notionPageId: null,
  parentId: null,
  teams: [],
  ...extra,
});

/** A small valid taxonomy: one domain, one field, two items. */
const base = (): TaxonomySource => ({
  domains: [domain("d1", "Government, Democracy & Public Affairs", "domain.07.government_democracy_and_public_affairs")],
  fields: [field("f1", "Participatory democracy", "field.07.02.participatory_democracy", "d1")],
  expertise: [
    item("i1", "Citizen assemblies", "07.02.citizen_assemblies", "f1", { teams: ["Communication"] }),
    item("i2", "Participatory budgeting", "07.02.participatory_budgeting", "f1", { teams: ["Treasury", "Tech"] }),
  ],
});
const codes = (plan: ReturnType<typeof planTaxonomyImport>) => plan.issues.map((issue) => `${issue.level}:${issue.code}:${issue.name}`);

describe("taxonomy import plan", () => {
  it("creates the whole tree on an empty database, with no issues", () => {
    const plan = planTaxonomyImport(base(), empty);
    expect(plan.issues).toEqual([]);
    expect(countPlan(plan)).toMatchObject({
      domain: { created: 1, skipped: 0 },
      field: { created: 1 },
      expertise: { created: 2 },
      teamLinks: { added: 3, removed: 0 },
      changes: 7,
    });
    expect(plan.levels.expertise.rows.map((r) => [r.pageId, r.parentPageId, r.statusKey, r.teamsAdd])).toEqual([
      ["i1", "f1", "active", ["communication"]],
      ["i2", "f1", "active", ["treasury", "tech"]],
    ]);
  });

  it("strips Notion's http:// auto-link from Stable IDs and trims them", () => {
    expect(cleanStableId("http://04.01.construction/")).toEqual({ value: "04.01.construction", httpRemoved: true });
    expect(cleanStableId("  HTTP://field.04.01.civil_engineering ")).toEqual({ value: "field.04.01.civil_engineering", httpRemoved: true });
    expect(cleanStableId(" 07.02.citizen_assemblies ")).toEqual({ value: "07.02.citizen_assemblies", httpRemoved: false });

    const source = base();
    source.expertise[0]!.rawStableId = "http://07.02.citizen_assemblies";
    const plan = planTaxonomyImport(source, empty);
    expect(plan.issues).toEqual([]);
    expect(plan.levels.expertise.rows[0]).toMatchObject({ stableId: "07.02.citizen_assemblies", httpRemoved: true });
  });

  it("stores an invalid Stable ID as empty and flags it — the row is still imported", () => {
    const source = base();
    source.domains[0]!.rawStableId = "domain.7.government";
    source.expertise[0]!.rawStableId = "07.02.Citizen-Assemblies";
    source.expertise[1]!.rawStableId = "";
    const plan = planTaxonomyImport(source, empty);
    expect(codes(plan)).toEqual([
      "domain:invalid_stable_id:Government, Democracy & Public Affairs",
      "expertise:invalid_stable_id:Citizen assemblies",
    ]);
    expect(plan.levels.domain.rows[0]).toMatchObject({ action: "create", stableId: null });
    expect(plan.levels.expertise.rows.map((r) => r.stableId)).toEqual([null, null]); // empty isn't flagged, just empty
    expect(countPlan(plan).expertise).toMatchObject({ created: 2, flagged: 1 });
  });

  it("imports an NN.NN mismatch but flags it (field vs domain, item vs field)", () => {
    const source = base();
    source.fields[0]!.rawStableId = "field.08.02.participatory_democracy";
    source.expertise[0]!.rawStableId = "07.03.citizen_assemblies";
    const plan = planTaxonomyImport(source, empty);
    // Both items now disagree with their field's 08.02 (i1 is also 07.03, not 07.02).
    expect(codes(plan)).toEqual([
      "field:nn_mismatch:Participatory democracy",
      "expertise:nn_mismatch:Citizen assemblies",
      "expertise:nn_mismatch:Participatory budgeting",
    ]);
    expect(countPlan(plan)).toMatchObject({ field: { created: 1, flagged: 1 }, expertise: { created: 2, flagged: 2 } });
  });

  it("imports the first of two same-named items in a field and skips the second (case-insensitive)", () => {
    const source = base();
    source.expertise.push(item("i3", "  citizen ASSEMBLIES ", "07.02.citizen_assemblies_2", "f1"));
    const plan = planTaxonomyImport(source, empty);
    expect(plan.issues.map((i) => [i.kind, i.code, i.pageId])).toEqual([["skipped", "duplicate_name", "i3"]]);
    expect(plan.levels.expertise.rows.map((r) => r.pageId)).toEqual(["i1", "i2"]);
    // The same name in another field is fine.
    source.fields.push(field("f2", "Deliberation", "field.07.03.deliberation", "d1"));
    source.expertise[2]!.parentPageIds = ["f2"];
    source.expertise[2]!.rawStableId = "07.03.citizen_assemblies";
    expect(planTaxonomyImport(source, empty).issues).toEqual([]);
  });

  it("keeps the first of two identical Stable IDs; the second is imported with an empty one and flagged", () => {
    const source = base();
    source.expertise[1]!.rawStableId = "07.02.citizen_assemblies";
    const plan = planTaxonomyImport(source, empty);
    expect(plan.issues.map((i) => [i.kind, i.code, i.pageId])).toEqual([["flagged", "duplicate_stable_id", "i2"]]);
    expect(plan.levels.expertise.rows.map((r) => [r.pageId, r.stableId])).toEqual([
      ["i1", "07.02.citizen_assemblies"],
      ["i2", null],
    ]);
  });

  it("leaves out unknown teams and statuses, keeping the rest of the row", () => {
    const source = base();
    source.expertise[0]!.teams = ["Communication", "Marketing"];
    source.expertise[1]!.status = "Archived";
    const plan = planTaxonomyImport(source, empty);
    expect(plan.issues.map((i) => [i.kind, i.code, i.detail])).toEqual([
      ["value_skipped", "unknown_team", 'Unknown team "Marketing" left out.'],
      ["value_skipped", "unknown_status", 'Unknown status "Archived" left out.'],
    ]);
    expect(plan.levels.expertise.rows.map((r) => [r.teamsAdd, r.statusKey])).toEqual([
      [["communication"], "active"],
      [["treasury", "tech"], null],
    ]);
  });

  it("skips rows whose parent can't be resolved — and, in turn, their children", () => {
    const source = base();
    source.fields.push(field("f9", "Orphan field", "field.07.09.orphan", "no-such-domain"));
    source.expertise.push(item("i9", "Orphan child", "07.09.orphan_child", "f9"));
    source.expertise.push(item("i8", "No field", "07.02.no_field", "f1", { parentPageIds: [] }));
    source.expertise.push(item("i7", "Two fields", "07.02.two_fields", "f1", { parentPageIds: ["f1", "f9"] }));
    const plan = planTaxonomyImport(source, empty);
    expect(plan.issues.map((i) => [i.pageId, i.code])).toEqual([
      ["f9", "unresolved_parent"],
      ["i9", "unresolved_parent"],
      ["i8", "unresolved_parent"],
      ["i7", "multiple_parents"],
    ]);
    expect(countPlan(plan)).toMatchObject({ field: { created: 1, skipped: 1 }, expertise: { created: 2, skipped: 3 } });
  });

  it("matches by Notion page id first, then by Stable ID — never by name", () => {
    const plan = planTaxonomyImport(
      base(),
      snapshot([
        node("domain", "D", "Government, Democracy & Public Affairs", { notionPageId: "d1", stableId: "domain.07.government_democracy_and_public_affairs", statusKey: "active" }),
        // Admin-made field with the right Stable ID but no Notion link: adopted.
        node("field", "F", "Old name", { parentId: "D", stableId: "field.07.02.participatory_democracy" }),
        // Same name as i1, but no link and no Stable ID: never matched by name.
        node("expertise", "X", "Citizen assemblies", { parentId: "F" }),
      ]),
    );
    expect(plan.levels.domain.rows[0]).toMatchObject({ action: "unchanged", dbId: "D", matchedBy: "page" });
    expect(plan.levels.field.rows[0]).toMatchObject({ action: "update", dbId: "F", matchedBy: "stable_id", changes: ["name", "statusKey", "notionPageId"] });
    expect(plan.levels.expertise.rows.map((r) => r.pageId)).toEqual(["i2"]);
    expect(plan.issues.map((i) => [i.code, i.pageId ?? i.dbId])).toEqual([
      ["name_taken", "i1"],
      ["missing_from_notion", "X"],
    ]);
  });

  it("reports database rows Notion doesn't have, and deprecates them only when asked — never deletes", () => {
    const extra = node("expertise", "OLD", "Retired skill", { stableId: "07.02.retired_skill", statusKey: "active", notionPageId: "gone", parentId: "F" });
    const already = node("expertise", "DEP", "Already deprecated", { statusKey: "deprecated", parentId: "F" });
    const report = planTaxonomyImport(base(), snapshot([extra, already]));
    expect(report.levels.expertise.missing.map((m) => [m.dbId, m.deprecate])).toEqual([
      ["OLD", false],
      ["DEP", false],
    ]);
    expect(countPlan(report).expertise.deprecated).toBe(0);

    const deprecating = planTaxonomyImport(base(), snapshot([extra, already]), { deprecateMissing: true });
    expect(deprecating.levels.expertise.missing.map((m) => [m.dbId, m.deprecate])).toEqual([
      ["OLD", true],
      ["DEP", false],
    ]);
    expect(countPlan(deprecating).expertise).toMatchObject({ missing: 2, deprecated: 1 });
  });

  it("a Stable ID still held by a row Notion no longer has isn't reused", () => {
    const plan = planTaxonomyImport(base(), snapshot([node("expertise", "OLD", "Old", { stableId: "07.02.citizen_assemblies", notionPageId: "gone", parentId: "F" })]));
    expect(plan.issues.filter((i) => i.kind === "flagged").map((i) => [i.code, i.pageId])).toEqual([["stable_id_taken", "i1"]]);
    expect(plan.levels.expertise.rows[0]!.stableId).toBeNull();
  });

  it("detects team and parent changes on matched rows", () => {
    const db = snapshot([
      node("domain", "D", "Government, Democracy & Public Affairs", { notionPageId: "d1", stableId: "domain.07.government_democracy_and_public_affairs", statusKey: "active" }),
      node("field", "F", "Participatory democracy", { notionPageId: "f1", parentId: "D", stableId: "field.07.02.participatory_democracy", statusKey: "active" }),
      node("expertise", "I1", "Citizen assemblies", { notionPageId: "i1", parentId: "F", stableId: "07.02.citizen_assemblies", statusKey: "active", teams: ["communication"] }),
      node("expertise", "I2", "Participatory budgeting", { notionPageId: "i2", parentId: "F", stableId: "07.02.participatory_budgeting", statusKey: "active", teams: ["tech", "communication"] }),
    ]);
    const plan = planTaxonomyImport(base(), db);
    expect(plan.levels.expertise.rows.map((r) => [r.action, r.changes, r.teamsAdd, r.teamsRemove])).toEqual([
      ["unchanged", [], [], []],
      ["update", ["teams"], ["treasury"], ["communication"]],
    ]);
    expect(countPlan(plan).teamLinks).toEqual({ added: 1, removed: 1 });
  });
});
