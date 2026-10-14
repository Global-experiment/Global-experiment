import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const revalidateTag = vi.fn();
vi.mock("next/cache", () => ({ revalidateTag }));
const { POST } = await import("./route");

const SECRET = "test-revalidate-secret-0123456789abcdef";
const call = (body: unknown, secret: string | null = SECRET) =>
  POST(
    new Request("http://localhost/api/revalidate", {
      method: "POST",
      headers: { "content-type": "application/json", ...(secret === null ? {} : { "x-revalidate-secret": secret }) },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

describe("POST /api/revalidate", () => {
  beforeEach(() => {
    vi.stubEnv("REVALIDATE_SECRET", SECRET);
    revalidateTag.mockClear();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("revalidates the known tags immediately (expire: 0) with the shared secret", async () => {
    const response = await call({ tags: ["treasury", "treasury"] });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ revalidated: ["treasury"] });
    expect(revalidateTag).toHaveBeenCalledExactlyOnceWith("treasury", { expire: 0 });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("refuses a missing or wrong secret, and any request when no secret is configured", async () => {
    expect((await call({ tags: ["treasury"] }, null)).status).toBe(401);
    expect((await call({ tags: ["treasury"] }, "wrong")).status).toBe(401);
    vi.stubEnv("REVALIDATE_SECRET", "");
    expect((await call({ tags: ["treasury"] }, "")).status).toBe(401);
    vi.stubEnv("REVALIDATE_SECRET", "short");
    expect((await call({ tags: ["treasury"] }, "short")).status).toBe(401);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("accepts only known tags in a well-formed body", async () => {
    for (const body of [{ tags: ["people"] }, { tags: [] }, { tag: "treasury" }, "not json", { tags: ["treasury"], extra: 1 }]) {
      expect((await call(body)).status, JSON.stringify(body)).toBe(400);
    }
    expect(revalidateTag).not.toHaveBeenCalled();
  });
});
