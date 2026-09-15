import { describe, expect, it } from "vitest";
import { rethrowNotFoundInErrorBoundary } from "./rethrowNotFoundInErrorBoundary";

describe("rethrowNotFoundInErrorBoundary", () => {
  it("rethrows when the error digest is the not-found marker", () => {
    const error = Object.assign(new Error("x"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
    expect(() => rethrowNotFoundInErrorBoundary(error)).toThrow(error);
  });

  it("does nothing for an ordinary error", () => {
    const error = Object.assign(new Error("boom"), { digest: undefined });
    expect(() => rethrowNotFoundInErrorBoundary(error)).not.toThrow();
  });
});
