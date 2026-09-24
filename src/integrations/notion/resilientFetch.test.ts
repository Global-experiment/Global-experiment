import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resilientFetch } from "./resilientFetch";

function connectTimeoutError(): TypeError {
  const cause = new Error("Connect Timeout Error");
  cause.name = "ConnectTimeoutError";
  return new TypeError("fetch failed", { cause });
}

function connResetError(): TypeError {
  const cause = Object.assign(new Error("socket hang up"), { code: "ECONNRESET" });
  return new TypeError("fetch failed", { cause });
}

describe("resilientFetch", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.useRealTimers();
  });

  it("returns the response on the first successful attempt without retrying", async () => {
    const ok = new Response("ok");
    global.fetch = vi.fn().mockResolvedValue(ok);

    const result = await resilientFetch("https://api.notion.com/v1/x");

    expect(result).toBe(ok);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("retries after a connect-timeout failure and succeeds on the next attempt", async () => {
    const ok = new Response("ok");
    const mock = vi.fn().mockRejectedValueOnce(connectTimeoutError()).mockResolvedValueOnce(ok);
    global.fetch = mock;

    const promise = resilientFetch("https://api.notion.com/v1/x");
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe(ok);
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it("retries an ECONNRESET failure the same way", async () => {
    const ok = new Response("ok");
    const mock = vi.fn().mockRejectedValueOnce(connResetError()).mockResolvedValueOnce(ok);
    global.fetch = mock;

    const promise = resilientFetch("https://api.notion.com/v1/x");
    await vi.runAllTimersAsync();
    expect(await promise).toBe(ok);
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it("gives up after exhausting its attempts and throws the last error", async () => {
    const mock = vi.fn().mockRejectedValue(connectTimeoutError());
    global.fetch = mock;

    const promise = resilientFetch("https://api.notion.com/v1/x");
    const assertion = expect(promise).rejects.toThrow("fetch failed");
    await vi.runAllTimersAsync();
    await assertion;
    expect(mock).toHaveBeenCalledTimes(3);
  });

  it("never retries a real HTTP error response (e.g. 401) — only a failed connection", async () => {
    const unauthorized = new Response("nope", { status: 401 });
    const mock = vi.fn().mockResolvedValue(unauthorized);
    global.fetch = mock;

    const result = await resilientFetch("https://api.notion.com/v1/x");

    expect(result.status).toBe(401);
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it("never retries an unrelated thrown error (not a connection failure)", async () => {
    const mock = vi.fn().mockRejectedValue(new TypeError("something else"));
    global.fetch = mock;

    await expect(resilientFetch("https://api.notion.com/v1/x")).rejects.toThrow("something else");
    expect(mock).toHaveBeenCalledTimes(1);
  });
});
