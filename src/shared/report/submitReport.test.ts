import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { ReportSubmissionDraft } from "@/shared/navigation/reportSubmission";
import { REPORT_KINDS, typeKeys } from "./reportKinds";
import { fetchBotCheckSiteKey, outcomeOf, REPORT_ERROR_MESSAGES, submitReport } from "./submitReport";

const draft: ReportSubmissionDraft = { kind: "feedback", message: "Clearer labels.", types: ["enhancement"], sourcePage: "/treasury", locale: "en-GB" };
const answering = (status: number, body: unknown = {}) => vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe("sending a report", () => {
  it("posts the submission and its token to the same-origin API route", async () => {
    const send = answering(201, { received: true });
    expect(await submitReport(draft, "token-1", send)).toBe("sent");
    const [path, init] = (send as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(path).toBe("/api/feedback/submissions");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ ...draft, token: "token-1" });
  });

  it("names each failure, and treats an unreachable API as unavailable", async () => {
    expect([429, 403, 400, 413, 503, 502, 500].map(outcomeOf)).toEqual([
      "rate_limited",
      "bot_check_failed",
      "refused",
      "refused",
      "unavailable",
      "unavailable",
      "unavailable",
    ]);
    const offline = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    expect(await submitReport(draft, "token-1", offline)).toBe("unavailable");
  });

  it("words every failure plainly, without technical details, and keeps the text", () => {
    for (const message of Object.values(REPORT_ERROR_MESSAGES)) {
      expect(message).not.toMatch(/\b(API|HTTP|\d{3}|token|Turnstile|Cloudflare)\b/i);
    }
    expect(REPORT_ERROR_MESSAGES.unavailable).toContain("Your text is kept");
  });

  it("reads the bot check's site key, or none when the API has none or is down", async () => {
    expect(await fetchBotCheckSiteKey(answering(200, { siteKey: "public-key" }))).toBe("public-key");
    expect(await fetchBotCheckSiteKey(answering(200, { siteKey: null }))).toBeNull();
    expect(await fetchBotCheckSiteKey(answering(502))).toBeNull();
  });
});

describe("report types", () => {
  it("are the API's keys, the ones migration 0020 seeds, each with its kind", () => {
    const seeds = readFileSync(join(__dirname, "../../../apps/api/drizzle/0020_feedback_lookups.sql"), "utf8");
    const seeded = [...seeds.matchAll(/\('([a-z_]+)', '(feedback|issue)', '([^']+)'/g)].map(([, key, kind, label]) => ({ key, kind, label }));
    const here = (["feedback", "issue"] as const).flatMap((kind) => REPORT_KINDS[kind].types.map((type) => ({ key: type.key, kind, label: type.label })));
    expect(here).toEqual(seeded);
    expect(here).toHaveLength(15);
  });

  it("turn labels into keys in the kind's order", () => {
    expect(typeKeys("issue", ["Compatibility", "Crash", "Praise"])).toEqual(["crash", "compatibility"]);
  });
});
