import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { organizations } from "../organizations/organizations.schema.js";
import { settings } from "../settings/settings.schema.js";
import { createTestDatabase } from "../testing/test-app.js";
import { treasuryDocuments } from "../treasury/treasury-documents.schema.js";
import { treasuryEntries, treasuryEntryExpenseTypes } from "../treasury/treasury.schema.js";
import { formatSamplePlan, planSamplePurge, planSampleSeed, purgeSampleTreasury, SAMPLE_EXPENSES, SAMPLE_FIGURES, SAMPLE_RECIPIENT, seedSampleTreasury } from "./sample-treasury.js";

const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

const NOW = new Date("2026-10-15T12:00:00Z");

describe("sample Treasury data", () => {
  it("adds published, reviewed sample expenses and the sample figures; refuses to add them twice", async () => {
    const { db, close } = await createTestDatabase();
    closers.push(close);

    const plan = await seedSampleTreasury(db, NOW);
    expect(plan).toEqual(planSampleSeed());
    expect(plan.expenses).toEqual({ USD: 12, EUR: 2, CHF: 2 });
    expect(formatSamplePlan(plan, "ADDED")).toContain("sample expenses: 2 CHF, 2 EUR, 12 USD");

    const rows = await db.select().from(treasuryEntries);
    expect(rows).toHaveLength(SAMPLE_EXPENSES.length);
    expect(rows.every((row) => row.sample && row.source === "manual" && row.entryType === "expense" && row.grossAmount < 0)).toBe(true);
    expect(rows.every((row) => row.publicationStatus === "published" && row.reviewStatusKey === "not_required" && row.publicDescription)).toBe(true);
    // The Figma's USD expenses: 39.8K.
    expect(rows.filter((row) => row.currency === "USD").reduce((sum, row) => sum - row.grossAmount, 0)).toBe(3_980_000);
    expect(await db.select().from(treasuryEntryExpenseTypes)).toHaveLength(SAMPLE_EXPENSES.reduce((sum, expense) => sum + expense.types.length, 0));
    expect(rows.every((row) => row.recipientOrganizationId === SAMPLE_RECIPIENT.id)).toBe(true);
    const [figures] = await db.select().from(settings).where(eq(settings.key, "treasury.sample_figures"));
    expect(figures?.value).toEqual(SAMPLE_FIGURES);

    await expect(seedSampleTreasury(db, NOW)).rejects.toThrow("16 sample entries are already there");
  });

  it("removes only the samples and the sample figures", async () => {
    const { db, close } = await createTestDatabase();
    closers.push(close);
    await db.insert(treasuryEntries).values({ managedBy: "native", entryType: "expense", name: "Real hosting", currency: "USD", grossAmount: -900, source: "manual", occurredOn: "2026-10-01" });
    await seedSampleTreasury(db, NOW);

    expect((await planSamplePurge(db)).expenses).toEqual({ USD: 12, EUR: 2, CHF: 2 });
    expect(await purgeSampleTreasury(db)).toEqual({ expenses: { USD: 12, EUR: 2, CHF: 2 }, figures: true });
    expect((await db.select({ name: treasuryEntries.name }).from(treasuryEntries)).map((row) => row.name)).toEqual(["Real hosting"]);
    expect(await db.select().from(treasuryEntryExpenseTypes)).toHaveLength(0);
    expect(await db.select().from(settings)).toHaveLength(0);
    expect(await db.select().from(organizations)).toHaveLength(0);
    expect(await planSamplePurge(db)).toEqual({ expenses: {}, figures: false });
  });

  it("refuses to remove a sample that has documents (they'd stay on disk)", async () => {
    const { db, close } = await createTestDatabase();
    closers.push(close);
    await seedSampleTreasury(db, NOW);
    const [sample] = await db.select({ id: treasuryEntries.id }).from(treasuryEntries).limit(1);
    await db.insert(treasuryDocuments).values({ entryId: sample!.id, fileName: "invoice.pdf", contentType: "application/pdf", sizeBytes: 10, sha256: "a".repeat(64), storageKey: "ab/cd/invoice" });
    await expect(purgeSampleTreasury(db)).rejects.toThrow("1 documents are attached to sample entries");
    expect(await db.select().from(treasuryEntries)).toHaveLength(SAMPLE_EXPENSES.length);
  });

  it("a Stripe entry can never be a sample", async () => {
    const { db, close } = await createTestDatabase();
    closers.push(close);
    await expect(
      db.insert(treasuryEntries).values({ managedBy: "native", entryType: "donation", name: "Anonymous donation", currency: "USD", grossAmount: 500, source: "stripe", livemode: false, sample: true, occurredOn: "2026-10-01" }),
    ).rejects.toThrow();
  });
});
