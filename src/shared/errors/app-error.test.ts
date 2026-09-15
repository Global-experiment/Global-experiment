import { describe, expect, it } from "vitest";
import {
  InternalError,
  NotFoundError,
  ProviderError,
  ValidationError,
  toSafeErrorResponse,
} from "./app-error";

describe("toSafeErrorResponse", () => {
  it("preserves the message for validation errors", () => {
    const result = toSafeErrorResponse(new ValidationError("Email is required"));
    expect(result).toEqual({ kind: "validation", message: "Email is required" });
  });

  it("preserves the message for not-found errors", () => {
    const result = toSafeErrorResponse(new NotFoundError("Article not found"));
    expect(result).toEqual({ kind: "not_found", message: "Article not found" });
  });

  it("hides internal error details behind a generic message", () => {
    const result = toSafeErrorResponse(new InternalError("Unexpected null in mapper at line 42"));
    expect(result.kind).toBe("internal");
    expect(result.message).not.toContain("line 42");
  });

  it("hides provider error details (e.g. leaked API responses) behind a generic message", () => {
    const result = toSafeErrorResponse(
      new ProviderError("Notion API responded with token=abc123 invalid"),
    );
    expect(result.kind).toBe("provider");
    expect(result.message).not.toContain("token=abc123");
  });

  it("treats unknown thrown values as internal errors without leaking their content", () => {
    const result = toSafeErrorResponse("raw string thrown from a dependency, secret=xyz");
    expect(result.kind).toBe("internal");
    expect(result.message).not.toContain("secret=xyz");
  });
});
