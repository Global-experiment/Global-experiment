import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Database } from "../../common/database/database.module.js";
import { expertiseDomains, expertiseFields, expertiseItems, expertiseTeams } from "../../expertise/expertise.schema.js";
import { people, peopleExpertise } from "../../people/people.schema.js";
import { createTestDatabase } from "../../testing/test-app.js";
import { importRuns } from "../import.schema.js";
import { formatTaxonomyReport, runTaxonomyImport } from "./taxonomy-import.js";
import type { SourceRow, TaxonomySource } from "./taxonomy-source.js";

// Test fixtures only — written to this test's in-process database, never elsewhere.
const row = (level: SourceRow["level"], pageId: string, name: string, rawStableId: string, extra: Partial<SourceRow> = {}): SourceRow => ({
  level,
  pageId,
  createdTime: "2026-09-25T10:00:00.000Z",
  name,
  rawStableId,
  status: "Active",
  parentPageIds: [],
  teams: [],
  ...extra,
});
const page = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, "0")}`;
const D1 = page(1);
const F1 = page(11);
const F2 = page(12);

function source(): TaxonomySource {
  return {
    domains: [row("domain", D1, "Government, Democracy & Public Affairs", "http://domain.07.government_democracy_and_public_affairs/")],
    fields: [
      row("field", F1, "Participatory democracy", "field.07.02.participatory_democracy", { parentPageIds: [D1] }),
      row("field", F2, "Public administration", "field.07.05.public_administration", { parentPageIds: [D1] }),
    ],
    expertise: [
      row("expertise", page(101), "Citizen assemblies", "07.02.citizen_assemblies", { parentPageIds: [F1], teams: ["Communication", "Moderation"] }),
      row("expertise", page(102), "Participatory budgeting", "http://07.02.participatory_budgeting", { parentPageIds: [F1], teams: ["Treasury"] }),
      row("expertise", page(103), "Public procurement", "07.05.public_procurement", { parentPageIds: [F2], teams: ["Compliance", "Marketing"] }),
      row("expertise", page(104), "Public Procurement", "07.05.public_procurement_dup", { parentPageIds: [F2] }), // duplicate name → skipped
      row("expertise", page(105), "E-government", "07.05.public_procurement", { parentPageIds: [F2] }), // duplicate Stable ID → empty, flagged
      row("expertise", page(106), "Open data", "07.04.open_data", { parentPageIds: [F2] }), // NN.NN mismatch → flagged
      row("expertise", page(107), "Lost item", "07.02.lost_item", { parentPageIds: [page(999)] }), // unresolved parent → skipped
    ],
  };
}

describe("taxonomy import (database)", () => {
  let db: Database;
  let close: () => Promise<void>;
  const options = { triggeredBy: "test" };

  beforeAll(async () => {
    ({ db, close } = await createTestDatabase());
  });
  afterAll(async () => {
    await close();
  });
  beforeEach(async () => {
    await db.delete(peopleExpertise);
    await db.delete(people);
    await db.delete(expertiseTeams);
    await db.delete(expertiseItems);
    await db.delete(expertiseFields);
    await db.delete(expertiseDomains);
    await db.delete(importRuns);
  });

  const items = () =>
    db
      .select({ name: expertiseItems.name, stableId: expertiseItems.stableId, statusKey: expertiseItems.statusKey, notionPageId: expertiseItems.notionPageId })
      .from(expertiseItems)
      .orderBy(asc(expertiseItems.name));

  it("dry run plans everything but writes only the import_runs record", async () => {
    const result = await runTaxonomyImport(db, source(), { ...options, apply: false });
    expect(result.counts).toMatchObject({ domain: { created: 1 }, field: { created: 2 }, expertise: { created: 5, skipped: 2, flagged: 2 } });
    expect(await db.$count(expertiseDomains)).toBe(0);
    expect(await db.$count(expertiseItems)).toBe(0);
    const runs = await db.select().from(importRuns);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ kind: "taxonomy", mode: "dry_run", triggeredBy: "test" });
    expect(runs[0]!.finishedAt!.getTime()).toBeGreaterThanOrEqual(runs[0]!.startedAt.getTime());
  });

  it("applies the plan: cleaned Stable IDs, flags, skips, statuses and teams", async () => {
    const result = await runTaxonomyImport(db, source(), { ...options, apply: true });

    const [domain] = await db.select().from(expertiseDomains);
    expect(domain).toMatchObject({ stableId: "domain.07.government_democracy_and_public_affairs", statusKey: "active", notionPageId: D1 });
    expect(await db.$count(expertiseFields)).toBe(2);
    expect(await items()).toEqual([
      { name: "Citizen assemblies", stableId: "07.02.citizen_assemblies", statusKey: "active", notionPageId: page(101) },
      { name: "E-government", stableId: null, statusKey: "active", notionPageId: page(105) },
      { name: "Open data", stableId: "07.04.open_data", statusKey: "active", notionPageId: page(106) },
      { name: "Participatory budgeting", stableId: "07.02.participatory_budgeting", statusKey: "active", notionPageId: page(102) },
      { name: "Public procurement", stableId: "07.05.public_procurement", statusKey: "active", notionPageId: page(103) },
    ]);
    // Items hang under the right field (resolved through the Notion relation).
    const [procurement] = await db.select({ fieldId: expertiseItems.fieldId }).from(expertiseItems).where(eq(expertiseItems.notionPageId, page(103)));
    const [publicAdministration] = await db.select({ id: expertiseFields.id }).from(expertiseFields).where(eq(expertiseFields.notionPageId, F2));
    expect(procurement!.fieldId).toBe(publicAdministration!.id);
    // Teams: unknown "Marketing" left out.
    expect((await db.select({ teamKey: expertiseTeams.teamKey }).from(expertiseTeams)).map((t) => t.teamKey).sort()).toEqual([
      "communication",
      "compliance",
      "moderation",
      "treasury",
    ]);

    const issues = result.plan.issues.map((issue) => `${issue.kind}:${issue.code}:${issue.name}`);
    expect(issues).toHaveLength(5);
    expect(new Set(issues)).toEqual(
      new Set([
        "skipped:duplicate_name:Public Procurement",
        "flagged:duplicate_stable_id:E-government",
        "flagged:nn_mismatch:Open data",
        "value_skipped:unknown_team:Public procurement",
        "skipped:unresolved_parent:Lost item",
      ]),
    );

    const report = formatTaxonomyReport(result);
    expect(report).toContain('Stable IDs with a leading "http://" removed: Domains 1, Fields 0, Expertise 1');
    expect(report).toContain("Skipped rows: 2");
    const [run] = await db.select().from(importRuns);
    expect(run).toMatchObject({ mode: "apply" });
    expect((run!.counts as { expertise: { created: number } }).expertise.created).toBe(5);
  });

  it("is idempotent: a second run reports 0 changes and writes nothing", async () => {
    await runTaxonomyImport(db, source(), { ...options, apply: true });
    const before = await db.select({ id: expertiseItems.id, updatedAt: expertiseItems.updatedAt }).from(expertiseItems);

    const second = await runTaxonomyImport(db, source(), { ...options, apply: true });
    expect(second.counts.changes).toBe(0);
    expect(second.counts).toMatchObject({
      domain: { created: 0, updated: 0, unchanged: 1 },
      field: { created: 0, updated: 0, unchanged: 2 },
      expertise: { created: 0, updated: 0, unchanged: 5 },
      teamLinks: { added: 0, removed: 0 },
    });
    expect(formatTaxonomyReport(second)).toContain("Result: 0 changes — the database already matches Notion.");
    expect(await db.select({ id: expertiseItems.id, updatedAt: expertiseItems.updatedAt }).from(expertiseItems)).toEqual(before);
  });

  it("applies Notion edits as updates: rename, Stable ID swap, move to another field, team change", async () => {
    await runTaxonomyImport(db, source(), { ...options, apply: true });
    const edited = source();
    edited.expertise[0]!.name = "Citizens' assemblies";
    edited.expertise[0]!.teams = ["Communication"];
    // Two items swap Stable IDs — the unique index must never see both at once.
    edited.expertise[0]!.rawStableId = "07.02.participatory_budgeting";
    edited.expertise[1]!.rawStableId = "07.02.citizen_assemblies";
    edited.expertise[5]!.parentPageIds = [F1]; // Open data moves to Participatory democracy

    const result = await runTaxonomyImport(db, edited, { ...options, apply: true });
    expect(result.counts.expertise).toMatchObject({ updated: 3, created: 0 });
    expect(result.counts.teamLinks).toEqual({ added: 0, removed: 1 });
    const byPage = Object.fromEntries((await db.select().from(expertiseItems)).map((item) => [item.notionPageId, item]));
    expect(byPage[page(101)]).toMatchObject({ name: "Citizens' assemblies", stableId: "07.02.participatory_budgeting" });
    expect(byPage[page(102)]).toMatchObject({ stableId: "07.02.citizen_assemblies" });
    const [participatory] = await db.select({ id: expertiseFields.id }).from(expertiseFields).where(eq(expertiseFields.notionPageId, F1));
    expect(byPage[page(106)]!.fieldId).toBe(participatory!.id);
  });

  it("is all or nothing: a failure rolls everything back and is recorded as failed", async () => {
    await expect(
      runTaxonomyImport(db, source(), {
        ...options,
        apply: true,
        beforeCommit: async () => {
          throw new Error("simulated failure before commit");
        },
      }),
    ).rejects.toThrow("simulated failure before commit");
    expect(await db.$count(expertiseDomains)).toBe(0);
    expect(await db.$count(expertiseFields)).toBe(0);
    expect(await db.$count(expertiseItems)).toBe(0);
    expect(await db.$count(expertiseTeams)).toBe(0);
    const runs = await db.select().from(importRuns);
    expect(runs.map((run) => run.mode)).toEqual(["failed"]);
    expect((runs[0]!.issues as { code: string; detail: string }[])[0]).toMatchObject({
      code: "run_failed",
      detail: "Rolled back, nothing written: simulated failure before commit",
    });
  });

  it("never deletes: rows missing from Notion are reported, and deprecated only with --deprecate-missing", async () => {
    await runTaxonomyImport(db, source(), { ...options, apply: true });
    // A person uses an item Notion later drops.
    const [person] = await db.insert(people).values({ name: "Real Person" }).returning();
    const [dropped] = await db.select().from(expertiseItems).where(eq(expertiseItems.notionPageId, page(106)));
    await db.insert(peopleExpertise).values({ personId: person!.id, expertiseId: dropped!.id });
    const withoutOpenData = source();
    withoutOpenData.expertise.splice(5, 1);

    const reported = await runTaxonomyImport(db, withoutOpenData, { ...options, apply: true });
    expect(reported.counts.expertise).toMatchObject({ missing: 1, deprecated: 0 });
    expect(reported.counts.changes).toBe(0);
    expect(await db.$count(expertiseItems)).toBe(5);

    const deprecated = await runTaxonomyImport(db, withoutOpenData, { ...options, apply: true, deprecateMissing: true });
    expect(deprecated.counts.expertise).toMatchObject({ missing: 1, deprecated: 1 });
    const [after] = await db.select().from(expertiseItems).where(eq(expertiseItems.id, dropped!.id));
    expect(after).toMatchObject({ statusKey: "deprecated", name: "Open data" });
    expect(await db.$count(peopleExpertise)).toBe(1);

    // Running the same thing again changes nothing (already deprecated).
    expect((await runTaxonomyImport(db, withoutOpenData, { ...options, apply: true, deprecateMissing: true })).counts.changes).toBe(0);
  });
});
