import { beforeEach, describe, expect, it, vi } from "vitest";

const getArticleBySlug = vi.fn();
vi.mock("@/modules/documentation/application/getArticleBySlug", () => ({
  getArticleBySlug: (slug: string) => getArticleBySlug(slug),
}));

const loggerError = vi.fn();
vi.mock("@/shared/logging/logger", () => ({
  logger: { error: (...args: unknown[]) => loggerError(...args), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

async function call(slug: string) {
  const { GET } = await import("./route");
  return GET(new Request("http://localhost/api/documentation/" + slug), {
    params: Promise.resolve({ slug }),
  });
}

// Synthetic test data only — never real CMS content.
const article = {
  slug: "introduction",
  title: "Introduction",
  displayOrder: 1,
  expertise: ["Civic technology"],
  publishedAt: new Date("2026-08-29T00:00:00.000Z"),
  content: [{ kind: "heading", level: 1, text: [{ kind: "text", value: "Summary" }] }],
};

beforeEach(() => {
  getArticleBySlug.mockReset();
  loggerError.mockReset();
});

describe("GET /api/documentation/[slug]", () => {
  it("returns the application-owned article shape with no caching", async () => {
    getArticleBySlug.mockResolvedValue(article);
    const response = await call("introduction");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body.article.title).toBe("Introduction");
    expect(body.article.content[0]).toEqual(article.content[0]);
  });

  it("returns a real 404 for an unknown slug", async () => {
    getArticleBySlug.mockResolvedValue(null);
    const response = await call("this-does-not-exist");
    expect(response.status).toBe(404);
  });

  it("rejects malformed slugs without touching the repository", async () => {
    const response = await call("..%2Fetc");
    expect(response.status).toBe(404);
    expect(getArticleBySlug).not.toHaveBeenCalled();
  });

  it("maps a provider failure to 500 and never exposes the error message", async () => {
    getArticleBySlug.mockRejectedValue(new Error("secret_token_abc leaked in message"));
    const response = await call("introduction");
    expect(response.status).toBe(500);
    const text = await response.text();
    expect(text).not.toContain("secret_token_abc");
    expect(text).not.toContain("leaked");
    expect(loggerError).toHaveBeenCalledOnce();
    expect(JSON.stringify(loggerError.mock.calls[0])).not.toContain("secret_token_abc");
  });
});
