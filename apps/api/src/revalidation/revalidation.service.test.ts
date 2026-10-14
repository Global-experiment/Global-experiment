import type { PinoLogger } from "nestjs-pino";
import { afterEach, describe, expect, it, vi } from "vitest";
import { testConfig } from "../testing/test-app.js";
import { RevalidationService } from "./revalidation.service.js";

const SECRET = "test-revalidate-secret-0123456789abcdef";
const logger = { setContext: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() } as unknown as PinoLogger;
const service = (env: NodeJS.ProcessEnv = {}) => new RevalidationService(testConfig({ WEB_INTERNAL_URL: "http://127.0.0.1:3100", ...env }), logger);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("RevalidationService", () => {
  it("posts the stale tags to the web server's revalidate route with the shared secret", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ revalidated: ["treasury"] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await service({ REVALIDATE_SECRET: SECRET }).revalidate(["treasury"])).toBe(true);
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith("http://127.0.0.1:3100/api/revalidate", {
      method: "POST",
      headers: { "content-type": "application/json", "x-revalidate-secret": SECRET },
      body: JSON.stringify({ tags: ["treasury"] }),
      signal: expect.any(AbortSignal),
    });
  });

  it("is skipped without a secret", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await service().revalidate(["treasury"])).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never throws: a refusal or an unreachable web server only logs (the 5-minute fallback applies)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 401 })));
    expect(await service({ REVALIDATE_SECRET: SECRET }).revalidate(["treasury"])).toBe(false);
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("fetch failed"))));
    expect(await service({ REVALIDATE_SECRET: SECRET }).revalidate(["treasury"])).toBe(false);
    // The secret is never logged.
    expect(JSON.stringify(vi.mocked(logger.warn).mock.calls)).not.toContain(SECRET);
  });
});
