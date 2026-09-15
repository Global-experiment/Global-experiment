export type AppErrorKind =
  | "validation"
  | "not_found"
  | "unauthorized"
  | "provider"
  | "transient"
  | "internal";

interface AppErrorOptions {
  cause?: unknown;
  details?: Record<string, unknown>;
}

export class AppError extends Error {
  readonly kind: AppErrorKind;
  readonly details?: Record<string, unknown>;

  constructor(kind: AppErrorKind, message: string, options: AppErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = "AppError";
    this.kind = kind;
    this.details = options.details;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("validation", message, { details });
    this.name = "ValidationError";
  }
}

export class NotFoundError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("not_found", message, { details });
    this.name = "NotFoundError";
  }
}

/** Failure originating from a third-party integration (Notion, Stripe, Wise, ...). */
export class ProviderError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super("provider", message, options);
    this.name = "ProviderError";
  }
}

export class InternalError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super("internal", message, options);
    this.name = "InternalError";
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/**
 * Maps any error to a message safe to return to end users / API responses.
 * Provider and internal failures are collapsed to a generic message so that
 * stack traces, provider error bodies, and internal details never leak.
 * The original error should still be passed to the logger by the caller.
 */
export function toSafeErrorResponse(error: unknown): { kind: AppErrorKind; message: string } {
  if (isAppError(error)) {
    if (error.kind === "internal" || error.kind === "provider") {
      return { kind: error.kind, message: "Something went wrong. Please try again later." };
    }
    return { kind: error.kind, message: error.message };
  }
  return { kind: "internal", message: "Something went wrong. Please try again later." };
}
