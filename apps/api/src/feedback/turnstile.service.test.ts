import type { PinoLogger } from "nestjs-pino";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseConfig, TURNSTILE_TEST_KEYS } from "../common/config/env.js";
import { FIXTURE_PASS_TOKEN, FIXTURE_SITE_KEY, SITEVERIFY_URL, TurnstileService } from "./turnstile.service.js";

const SECRET = "made-up-secret-for-tests";

function service(env: NodeJS.ProcessEnv) {
  const logger = { setContext: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const config = parseConfig({
    DATABASE_URL: "postgres://fake_user@localhost:5432/fake_db",
    NODE_ENV: "production",
    ADMIN_ALLOWED_ORIGINS: "https://example.org",
    PUBLIC_SITE_URL: "https://example.org",
    ...env,
  });
  return { turnstile: new TurnstileService(config, logger as unknown as PinoLogger), logger };
}

/** Cloudflare's siteverify, answered with this body (or this failure). */
function cloudflareAnswers(answer: object | Error, status = 200) {
  const fetchMock = vi.fn(async () => {
    if (answer instanceof Error) throw answer;
    return new Response(JSON.stringify(answer), { status, headers: { "content-type": "application/json" } });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Turnstile bot check", () => {
  it("verifies on the server with the secret and the token only (no visitor address)", async () => {
    const fetchMock = cloudflareAnswers({ success: true, hostname: "example.org", action: "issue" });
    const { turnstile } = service({ TURNSTILE_SECRET_KEY: SECRET, TURNSTILE_SITE_KEY: "site-key" });
    expect(await turnstile.verify("token-from-the-page", "issue")).toBe("passed");
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(SITEVERIFY_URL);
    expect(JSON.parse(init.body as string)).toEqual({ secret: SECRET, response: "token-from-the-page" });
    expect(turnstile.siteKey()).toBe("site-key");
  });

  it("refuses a token Cloudflare rejects, or one solved for another site or form", async () => {
    const { turnstile } = service({ TURNSTILE_SECRET_KEY: SECRET, TURNSTILE_SITE_KEY: "site-key" });
    cloudflareAnswers({ success: false, "error-codes": ["invalid-input-response"] });
    expect(await turnstile.verify("t", "feedback")).toBe("failed");
    cloudflareAnswers({ success: false, "error-codes": ["timeout-or-duplicate"] });
    expect(await turnstile.verify("t", "feedback")).toBe("failed");
    cloudflareAnswers({ success: true, hostname: "elsewhere.example.org", action: "feedback" });
    expect(await turnstile.verify("t", "feedback")).toBe("failed");
    cloudflareAnswers({ success: true, hostname: "example.org", action: "issue" });
    expect(await turnstile.verify("t", "feedback")).toBe("failed");
  });

  it("is unavailable, never passed, when Cloudflare fails or the secret is refused", async () => {
    const { turnstile, logger } = service({ TURNSTILE_SECRET_KEY: SECRET, TURNSTILE_SITE_KEY: "site-key" });
    cloudflareAnswers(new Error("network down"));
    expect(await turnstile.verify("t", "feedback")).toBe("unavailable");
    cloudflareAnswers({}, 500);
    expect(await turnstile.verify("t", "feedback")).toBe("unavailable");
    cloudflareAnswers({ success: false, "error-codes": ["internal-error"] });
    expect(await turnstile.verify("t", "feedback")).toBe("unavailable");
    cloudflareAnswers({ success: false, "error-codes": ["invalid-input-secret"] });
    expect(await turnstile.verify("t", "feedback")).toBe("unavailable");
    expect(logger.error).toHaveBeenCalledTimes(4);
    // The logs never carry the secret.
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain(SECRET);
  });

  it("without a secret, refuses every token without calling Cloudflare, and says so in the log", async () => {
    const fetchMock = cloudflareAnswers({ success: true });
    const { turnstile, logger } = service({ TURNSTILE_SITE_KEY: "site-key" });
    expect(logger.warn).toHaveBeenCalledOnce();
    expect(turnstile.siteKey()).toBeNull();
    expect(await turnstile.verify("t", "feedback")).toBe("unavailable");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledOnce();
  });

  it("accepts any page and form with Cloudflare's test secret (local development)", async () => {
    cloudflareAnswers({ success: true, hostname: "example.com", action: "" });
    const { turnstile } = service({ NODE_ENV: "development", ADMIN_ALLOWED_ORIGINS: undefined });
    expect(turnstile.siteKey()).toBe(TURNSTILE_TEST_KEYS.siteKey);
    expect(await turnstile.verify("XXXX.DUMMY.TOKEN.XXXX", "feedback")).toBe("passed");
  });

  it("checks in-process in test mode: only the fixture token passes", async () => {
    const fetchMock = cloudflareAnswers({ success: true });
    const { turnstile } = service({ NODE_ENV: "test", TURNSTILE_FIXTURE: "1" });
    expect(turnstile.siteKey()).toBe(FIXTURE_SITE_KEY);
    expect(await turnstile.verify(FIXTURE_PASS_TOKEN, "feedback")).toBe("passed");
    expect(await turnstile.verify("anything-else", "feedback")).toBe("failed");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
