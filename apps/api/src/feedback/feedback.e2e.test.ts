import { and, eq } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditEvents } from "../audit/audit.schema.js";
import { expertiseDomains, expertiseFields, expertiseItems } from "../expertise/expertise.schema.js";
import { signedInAdmin, signedInAs, type SignedInAdmin } from "../testing/admin-session.js";
import { createTestApp, TEST_ORIGIN, type TestApp } from "../testing/test-app.js";
import { submissions, submissionTypeLinks } from "./feedback.schema.js";
import { FIXTURE_PASS_TOKEN, FIXTURE_SITE_KEY } from "./turnstile.service.js";

/**
 * Feedbacks and issues, part 1: the public intake (validation, origin, bot check, rate and size limits) and the
 * admin API (list, record, qualification, archive and restore, History, permissions). Made-up text only.
 */

let ipCounter = 0;
/** A public request from its own client address, so each test starts with a fresh rate limit. */
const publicClient = (t: TestApp, ip = `203.0.113.${++ipCounter % 250}`) => ({
  submit: (body: object, origin: string | null = TEST_ORIGIN) => {
    const req = request(t.app.getHttpServer()).post("/api/feedback/submissions").set("x-forwarded-for", ip);
    return (origin ? req.set("origin", origin) : req).send(body);
  },
});

const feedback = (overrides: object = {}) => ({
  kind: "feedback",
  message: "The Treasury filters could remember the year.",
  types: ["enhancement", "ux_friction"],
  sourcePage: "/treasury?year=2026",
  locale: "en-GB",
  token: FIXTURE_PASS_TOKEN,
  ...overrides,
});

/** The database refused the write, by this constraint (the drivers word the error differently; the name is in both). */
async function refusedBy(write: Promise<unknown>, constraint: string) {
  const error = await write.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).not.toBeNull();
  const cause = (error as { cause?: { message?: string } }).cause;
  expect(`${(error as Error).message} ${cause?.message ?? ""}`).toContain(constraint);
}

describe("feedbacks and issues", () => {
  let t: TestApp;
  let owner: SignedInAdmin;
  let expertise: { id: string; name: string }[];

  beforeAll(async () => {
    t = await createTestApp({ TRUST_PROXY_HOPS: "1", TURNSTILE_FIXTURE: "1" });
    owner = await signedInAdmin(t);
    const [domain] = await t.db.insert(expertiseDomains).values({ name: "Technology", stableId: "domain.09.technology", statusKey: "active" }).returning();
    const [field] = await t.db
      .insert(expertiseFields)
      .values({ name: "Interfaces", domainId: domain!.id, stableId: "field.09.01.interfaces", statusKey: "active" })
      .returning();
    expertise = await t.db
      .insert(expertiseItems)
      .values(
        Array.from({ length: 11 }, (_, index) => ({
          name: `Interface topic ${String(index + 1).padStart(2, "0")}`,
          fieldId: field!.id,
          stableId: `09.01.topic_${index + 1}`,
          statusKey: "active",
        })),
      )
      .returning({ id: expertiseItems.id, name: expertiseItems.name });
  });
  afterAll(async () => {
    await t.close();
  });

  type Item = {
    action: string;
    actor: { type: string; label: string };
    changes: { field: string; before: unknown; after: unknown }[];
    meta: Record<string, unknown>;
  };
  const feed = async (id: string, admin: SignedInAdmin = owner) => (await admin.get(`/api/admin/history/submission/${id}`).expect(200)).body.items as Item[];
  const latest = async () => (await owner.get("/api/admin/feedback?pageSize=1").expect(200)).body.items[0];

  describe("the public intake", () => {
    it("gives the composer the bot check's site key", async () => {
      expect((await request(t.app.getHttpServer()).get("/api/feedback/config").expect(200)).body).toEqual({ siteKey: FIXTURE_SITE_KEY });
    });

    it("saves a feedback with the visitor's types, page and language, and records it in History", async () => {
      const res = await publicClient(t).submit(feedback()).expect(201);
      expect(res.body).toEqual({ received: true });
      const saved = await latest();
      expect(saved).toMatchObject({
        kind: "feedback",
        submittedKind: "feedback",
        body: "The Treasury filters could remember the year.",
        pickedTypes: [
          { key: "enhancement", label: "Enhancement" },
          { key: "ux_friction", label: "UX friction" },
        ],
        sourcePage: "/treasury?year=2026",
        locale: "en-GB",
        status: null,
        type: null,
        significanceScore: null,
        botScore: null,
        aiSignificanceScore: null,
        translation: null,
        archivedAt: null,
      });
      expect(saved.number).toBeGreaterThan(0);
      const [created] = await feed(saved.id);
      expect(created).toMatchObject({ action: "created", actor: { type: "automation", label: "Public form" }, meta: { label: `#${saved.number} · Feedback` } });
    });

    it("trims the text, keeps 5,000 characters and refuses more", async () => {
      await publicClient(t)
        .submit(feedback({ message: `  ${"a".repeat(5000)}  `, types: [] }))
        .expect(201);
      expect((await latest()).body).toHaveLength(5000);
      await publicClient(t)
        .submit(feedback({ message: "a".repeat(5001) }))
        .expect(400);
      await publicClient(t)
        .submit(feedback({ message: "   " }))
        .expect(400);
    });

    it("takes types only from the kind's list, each once", async () => {
      await publicClient(t)
        .submit(feedback({ types: ["crash"] }))
        .expect(400);
      await publicClient(t)
        .submit(feedback({ types: ["no_such_type"] }))
        .expect(400);
      await publicClient(t)
        .submit(feedback({ types: ["praise", "praise"] }))
        .expect(400);
      await publicClient(t)
        .submit(feedback({ kind: "issue", types: ["crash", "security_vulnerability"] }))
        .expect(201);
      expect((await latest()).pickedTypes.map((type: { key: string }) => type.key)).toEqual(["crash", "security_vulnerability"]);
    });

    it("drops a source page the site wouldn't keep, and refuses unknown fields and shapes", async () => {
      for (const sourcePage of ["https://elsewhere.example.org/x", "//elsewhere.example.org", "javascript:alert(1)", "/feedback"]) {
        await publicClient(t).submit(feedback({ sourcePage })).expect(201);
        expect((await latest()).sourcePage).toBeNull();
      }
      await publicClient(t)
        .submit(feedback({ email: "visitor@example.org" }))
        .expect(400);
      await publicClient(t)
        .submit(feedback({ kind: "praise" }))
        .expect(400);
      await publicClient(t)
        .submit(feedback({ locale: "not a language" }))
        .expect(400);
      await publicClient(t)
        .submit(feedback({ token: "" }))
        .expect(400);
    });

    it("refuses a body over 32 KB before reading it", async () => {
      const res = await publicClient(t)
        .submit(feedback({ message: "a".repeat(40_000) }))
        .expect(413);
      expect(res.body.error.code).toBe("payload_too_large");
    });

    it("accepts only the site's own pages", async () => {
      await publicClient(t).submit(feedback(), null).expect(403);
      await publicClient(t).submit(feedback(), "https://elsewhere.example.org").expect(403);
    });

    it("refuses a failed bot check and saves nothing", async () => {
      const before = (await owner.get("/api/admin/feedback").expect(200)).body.total;
      const res = await publicClient(t)
        .submit(feedback({ token: "fixture-fail" }))
        .expect(403);
      expect(res.body.error.message).toBe("We couldn't confirm you're a person. Please try again.");
      expect((await owner.get("/api/admin/feedback").expect(200)).body.total).toBe(before);
    });

    it("limits each client to 10 submissions in 15 minutes", async () => {
      const client = publicClient(t, "198.18.0.7");
      for (let index = 0; index < 10; index += 1) await client.submit(feedback({ message: `Rate limit ${index}` })).expect(201);
      const blocked = await client.submit(feedback()).expect(429);
      expect(blocked.body.error.code).toBe("rate_limited");
      // Another visitor isn't affected.
      await publicClient(t).submit(feedback()).expect(201);
    });

    it("keeps the visitor's picks tied to the kind they chose, in the database itself", async () => {
      const [row] = await t.db.insert(submissions).values({ kind: "feedback", submittedKind: "feedback", body: "Database rule check." }).returning();
      await refusedBy(t.db.insert(submissionTypeLinks).values({ submissionId: row!.id, kind: "feedback", typeKey: "crash" }), "submission_type_links_type_fk");
      await refusedBy(
        t.db.insert(submissionTypeLinks).values({ submissionId: row!.id, kind: "issue", typeKey: "crash" }),
        "submission_type_links_submission_fk",
      );
      await refusedBy(t.db.update(submissions).set({ typeKey: "crash" }).where(eq(submissions.id, row!.id)), "submissions_type_of_kind_fk");
      await refusedBy(t.db.update(submissions).set({ significanceScore: 10.5 }).where(eq(submissions.id, row!.id)), "submissions_significance_range");
      await refusedBy(t.db.update(submissions).set({ body: " " }).where(eq(submissions.id, row!.id)), "submissions_body_length");
    });
  });

  describe("the admin API", () => {
    let item: { id: string; number: number };
    let issue: { id: string; number: number };

    beforeAll(async () => {
      await publicClient(t)
        .submit(feedback({ message: "Offer a print-friendly proposal page.", types: ["feature_request"] }))
        .expect(201);
      item = await latest();
      await publicClient(t)
        .submit(feedback({ kind: "issue", message: "The language menu does not open.", types: ["functional_bug"] }))
        .expect(201);
      issue = await latest();
    });

    it("offers the kinds, the 15 types and the two statuses", async () => {
      const options = (await owner.get("/api/admin/feedback/options").expect(200)).body;
      expect(options.kinds).toEqual([
        { key: "feedback", label: "Feedback" },
        { key: "issue", label: "Issue" },
      ]);
      expect(options.types.filter((type: { kind: string }) => type.kind === "feedback")).toHaveLength(6);
      expect(options.types.filter((type: { kind: string }) => type.kind === "issue")).toHaveLength(9);
      expect(options.statuses).toEqual([
        { key: "roadmap_item", label: "Roadmap item" },
        { key: "discarded", label: "Discarded" },
      ]);
    });

    it("lists by tab, newest first, with search and pages", async () => {
      const all = (await owner.get("/api/admin/feedback").expect(200)).body;
      expect(all.items[0].id).toBe(issue.id);
      const issues = (await owner.get("/api/admin/feedback?filter=kind:is:issue").expect(200)).body;
      expect(issues.items.every((row: { kind: string }) => row.kind === "issue")).toBe(true);
      expect(issues.total).toBeLessThan(all.total);
      const found = (await owner.get(`/api/admin/feedback?search=${encodeURIComponent("print-friendly")}`).expect(200)).body;
      expect(found.items.map((row: { id: string }) => row.id)).toEqual([item.id]);
      expect((await owner.get(`/api/admin/feedback?search=%23${item.number}`).expect(200)).body.items[0].id).toBe(item.id);
      const page = (await owner.get("/api/admin/feedback?pageSize=2&page=2").expect(200)).body;
      expect(page).toMatchObject({ page: 2, pageSize: 2, total: all.total });
      expect(page.items).toHaveLength(2);
      await owner.get("/api/admin/feedback?sort=body:asc").expect(400);
      await owner.get("/api/admin/feedback?filter=picked_type:is:praise").expect(400);
    });

    it("qualifies a submission in one save, with every field in one History event", async () => {
      const updated = (
        await owner
          .patch(`/api/admin/feedback/${item.id}`, {
            typeKey: "feature_request",
            statusKey: "roadmap_item",
            expertiseIds: [expertise[1]!.id, expertise[0]!.id],
            significanceScore: "8.2",
            decisionComment: "  Useful for offline reading.  ",
          })
          .expect(200)
      ).body;
      expect(updated).toMatchObject({
        type: { key: "feature_request", label: "Feature request" },
        status: { key: "roadmap_item", label: "Roadmap item" },
        expertise: [expertise[1], expertise[0]],
        significanceScore: 8.2,
        decisionComment: "Useful for offline reading.",
      });
      const [event] = await feed(item.id);
      expect(event!.action).toBe("updated");
      expect(event!.changes.map((change) => change.field)).toEqual(["type", "expertise", "status", "significanceScore", "decisionComment"]);
      expect(event!.changes.find((change) => change.field === "significanceScore")).toMatchObject({ before: null, after: 8.2 });
      expect(event!.changes.find((change) => change.field === "status")).toMatchObject({ before: null, after: { key: "roadmap_item", label: "Roadmap item" } });

      // The same values again: nothing changes, no event, "Last edited at" stays.
      const count = (await feed(item.id)).length;
      const again = (await owner.patch(`/api/admin/feedback/${item.id}`, { statusKey: "roadmap_item", significanceScore: 8.2 }).expect(200)).body;
      expect(again.updatedAt).toBe(updated.updatedAt);
      expect(await feed(item.id)).toHaveLength(count);
    });

    it("checks the score, the type's kind, the status and the expertise", async () => {
      for (const significanceScore of ["8.25", "10.1", "-1", "high", 11]) {
        const res = await owner.patch(`/api/admin/feedback/${item.id}`, { significanceScore }).expect(400);
        expect(JSON.stringify(res.body)).toContain("Use a number from 0 to 10, with at most one decimal (like 8.2).");
      }
      await owner.patch(`/api/admin/feedback/${item.id}`, { significanceScore: "10.0" }).expect(200);
      await owner.patch(`/api/admin/feedback/${item.id}`, { significanceScore: 0 }).expect(200);
      await owner.patch(`/api/admin/feedback/${item.id}`, { typeKey: "crash" }).expect(400);
      await owner.patch(`/api/admin/feedback/${item.id}`, { statusKey: "archived" }).expect(400);
      await owner.patch(`/api/admin/feedback/${item.id}`, { expertiseIds: expertise.map((entry) => entry.id) }).expect(400);
      await owner.patch(`/api/admin/feedback/${item.id}`, { expertiseIds: ["00000000-0000-4000-8000-0000000000ff"] }).expect(400);
      await owner.patch(`/api/admin/feedback/${item.id}`, {}).expect(400);
      await owner.patch(`/api/admin/feedback/${item.id}`, { body: "Rewritten" }).expect(400);
    });

    it("reclassifies: a new kind drops the old kind's type; what the visitor sent stays", async () => {
      const moved = (await owner.patch(`/api/admin/feedback/${item.id}`, { kind: "issue" }).expect(200)).body;
      expect(moved).toMatchObject({ kind: "issue", submittedKind: "feedback", type: null, pickedTypes: [{ key: "feature_request" }] });
      const [event] = await feed(item.id);
      expect(event!.changes.map((change) => change.field)).toEqual(["kind", "type"]);
      const typed = (await owner.patch(`/api/admin/feedback/${item.id}`, { kind: "feedback", typeKey: "praise" }).expect(200)).body;
      expect(typed).toMatchObject({ kind: "feedback", type: { key: "praise" } });
    });

    it("filters by status (none = new), type and expertise", async () => {
      const ids = async (query: string) =>
        (await owner.get(`/api/admin/feedback?${query}`).expect(200)).body.items.map((row: { id: string }) => row.id) as string[];
      expect(await ids("filter=status:is:roadmap_item")).toEqual([item.id]);
      expect(await ids("filter=status:is_empty&pageSize=100")).not.toContain(item.id);
      expect(await ids("filter=status:is_empty&pageSize=100")).toContain(issue.id);
      expect(await ids("filter=type:is:praise")).toEqual([item.id]);
      expect(await ids(`filter=expertise:is:${expertise[0]!.id}`)).toEqual([item.id]);
      expect(await ids(`filter=expertise:is:${expertise[5]!.id}`)).toEqual([]);
    });

    it("sorts by significance, highest first, unscored last", async () => {
      await owner.patch(`/api/admin/feedback/${issue.id}`, { significanceScore: 7.4 }).expect(200);
      await owner.patch(`/api/admin/feedback/${item.id}`, { significanceScore: 9.1 }).expect(200);
      const rows = (await owner.get("/api/admin/feedback?sort=significance:desc&pageSize=3").expect(200)).body.items;
      expect(rows.map((row: { id: string }) => row.id)).toEqual([item.id, issue.id, expect.any(String)]);
      expect(rows[2].significanceScore).toBeNull();
    });

    it("archives and restores, out of the default list while archived, with History", async () => {
      const archived = (await owner.post(`/api/admin/feedback/${issue.id}/archive`).expect(200)).body;
      expect(archived.archivedAt).not.toBeNull();
      const listed = async (query = "") =>
        (await owner.get(`/api/admin/feedback?pageSize=100${query}`).expect(200)).body.items.map((row: { id: string }) => row.id);
      expect(await listed()).not.toContain(issue.id);
      expect(await listed("&filter=archived:is:true")).toEqual([issue.id]);
      await owner.post(`/api/admin/feedback/${issue.id}/restore`).expect(200);
      expect(await listed()).toContain(issue.id);
      expect((await feed(issue.id)).slice(0, 2).map((event) => event.action)).toEqual(["restored", "archived"]);
      const rows = await t.db
        .select({ id: auditEvents.id })
        .from(auditEvents)
        .where(and(eq(auditEvents.entityType, "submission"), eq(auditEvents.entityId, issue.id)));
      expect(rows.length).toBeGreaterThanOrEqual(3);
    });

    it("counts views and takes comments, like every record", async () => {
      expect((await owner.post(`/api/admin/history/submission/${item.id}/views`).expect(201)).body.views).toBeGreaterThanOrEqual(1);
      await owner.post(`/api/admin/history/submission/${item.id}/comments`, { body: "Checked on a narrow screen." }).expect(204);
      expect((await feed(item.id))[0]).toMatchObject({ action: "comment_added" });
    });

    it("gives feedback.read the list and record, feedback.update the changes, and nothing to other roles", async () => {
      const reader = await signedInAs(t, "communication");
      await reader.get("/api/admin/feedback").expect(200);
      await reader.get(`/api/admin/feedback/${item.id}`).expect(200);
      await reader.get(`/api/admin/history/submission/${item.id}`).expect(200);
      await reader.patch(`/api/admin/feedback/${item.id}`, { statusKey: "discarded" }).expect(403);
      await reader.post(`/api/admin/feedback/${item.id}/archive`).expect(403);

      const moderator = await signedInAs(t, "moderation");
      await moderator.patch(`/api/admin/feedback/${item.id}`, { statusKey: "discarded" }).expect(200);
      await moderator.post(`/api/admin/feedback/${item.id}/archive`).expect(200);
      await moderator.post(`/api/admin/feedback/${item.id}/restore`).expect(200);

      const outsider = await signedInAs(t, "treasury");
      await outsider.get("/api/admin/feedback").expect(403);
      await outsider.get(`/api/admin/feedback/${item.id}`).expect(403);
      await outsider.get(`/api/admin/history/submission/${item.id}`).expect(403);
      const history = (await outsider.get("/api/admin/history?pageSize=200").expect(200)).body.items as { entity: { type: string } }[];
      expect(history.some((event) => event.entity.type === "submission")).toBe(false);

      const refusals = await t.db.select({ meta: auditEvents.meta }).from(auditEvents).where(eq(auditEvents.action, "permission_denied"));
      expect(refusals.some((event) => JSON.stringify(event.meta).includes("feedback.update"))).toBe(true);
      expect(refusals.some((event) => JSON.stringify(event.meta).includes("feedback.read"))).toBe(true);
    });

    it("needs a session", async () => {
      await request(t.app.getHttpServer()).get("/api/admin/feedback").expect(401);
    });
  });
});

describe("feedback intake without a bot check secret", () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp({ TRUST_PROXY_HOPS: "1" });
  });
  afterAll(async () => {
    await t.close();
  });

  it("offers no site key and refuses every submission with 503, saving nothing", async () => {
    expect((await request(t.app.getHttpServer()).get("/api/feedback/config").expect(200)).body).toEqual({ siteKey: null });
    const res = await publicClient(t).submit(feedback()).expect(503);
    expect(res.body.error.code).toBe("unavailable");
    expect(await t.db.select({ id: submissions.id }).from(submissions)).toEqual([]);
  });
});
