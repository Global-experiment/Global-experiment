export type ApiErrorCode =
  | "validation_failed"
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "payload_too_large"
  | "rate_limited"
  | "provider_unavailable"
  | "internal";

export const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  validation_failed: 400,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  payload_too_large: 413,
  rate_limited: 429,
  provider_unavailable: 502,
  internal: 500,
};

/**
 * Errors the API raises on purpose. `message` and `details` are returned to
 * the client, so they must never contain secrets, SQL, provider payloads or
 * other people's personal data. Anything unexpected becomes `internal`.
 */
export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly details?: unknown,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "ApiError";
  }

  get status(): number {
    return STATUS_BY_CODE[this.code];
  }
}

export interface ValidationIssue {
  path: string;
  message: string;
}

export class ValidationFailedError extends ApiError {
  constructor(issues: ValidationIssue[]) {
    super("validation_failed", "The request is invalid.", { issues });
  }
}

export class UnauthenticatedError extends ApiError {
  constructor(message = "Authentication is required.") {
    super("unauthenticated", message);
  }
}

export class ForbiddenError extends ApiError {
  constructor(message = "This request is not allowed.") {
    super("forbidden", message);
  }
}

export class NotFoundError extends ApiError {
  constructor(message = "Not found.") {
    super("not_found", message);
  }
}

export class ConflictError extends ApiError {
  constructor(message = "This conflicts with existing data.", details?: unknown) {
    super("conflict", message, details);
  }
}

/** Failure of a third-party provider (Notion, Stripe, Wise, OpenAI, email). */
export class ProviderUnavailableError extends ApiError {
  constructor(provider: string, options?: { cause?: unknown }) {
    super("provider_unavailable", `${provider} is temporarily unavailable.`, undefined, options);
  }
}
