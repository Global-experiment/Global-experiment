import { Catch, HttpException, HttpStatus, type ArgumentsHost, type ExceptionFilter } from "@nestjs/common";
import type { Request, Response } from "express";
import { PinoLogger } from "nestjs-pino";
import { ApiError, type ApiErrorCode } from "./api-error.js";
import { toApiErrorFromDatabase } from "./database-errors.js";

const CODE_BY_HTTP_STATUS: Partial<Record<number, ApiErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: "validation_failed",
  [HttpStatus.UNAUTHORIZED]: "unauthenticated",
  [HttpStatus.FORBIDDEN]: "forbidden",
  [HttpStatus.NOT_FOUND]: "not_found",
  [HttpStatus.CONFLICT]: "conflict",
  [HttpStatus.PAYLOAD_TOO_LARGE]: "payload_too_large",
  [HttpStatus.TOO_MANY_REQUESTS]: "rate_limited",
};

const SAFE_MESSAGE: Record<ApiErrorCode, string> = {
  validation_failed: "The request is invalid.",
  unauthenticated: "Authentication is required.",
  forbidden: "This request is not allowed.",
  not_found: "Not found.",
  conflict: "This conflicts with existing data.",
  payload_too_large: "The request body is too large.",
  rate_limited: "Too many requests. Please try again later.",
  provider_unavailable: "An external service is temporarily unavailable.",
  internal: "Something went wrong. Please try again later.",
};

/**
 * The single place that turns any thrown value into the API's error body:
 *   { "error": { "code", "message", "requestId", "details"? } }
 * Stack traces, SQL, provider responses and framework internals never reach
 * the client; unexpected errors are logged in full server-side only.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(AllExceptionsFilter.name);
  }

  catch(exception: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const request = http.getRequest<Request & { id?: string }>();
    const response = http.getResponse<Response>();

    const apiError = this.toApiError(exception);
    const status = apiError ? apiError.status : HttpStatus.INTERNAL_SERVER_ERROR;
    const code: ApiErrorCode = apiError?.code ?? "internal";

    if (status >= 500) {
      this.logger.error({ err: exception, code }, "Request failed");
    } else {
      this.logger.debug({ code, status }, "Request rejected");
    }

    const body: { code: ApiErrorCode; message: string; requestId?: string; details?: unknown } = {
      code,
      message: apiError && status < 500 ? apiError.message : SAFE_MESSAGE[code],
      requestId: request.id,
    };
    if (apiError?.details !== undefined && status < 500) body.details = apiError.details;

    response.status(status).json({ error: body });
  }

  private toApiError(exception: unknown): ApiError | undefined {
    if (exception instanceof ApiError) return exception;

    const fromDatabase = toApiErrorFromDatabase(exception);
    if (fromDatabase) return fromDatabase;

    const status = httpStatusOf(exception);
    if (status === undefined || status >= 500) return undefined;
    // Framework/middleware messages (e.g. "Cannot GET /x") are replaced by fixed copy.
    const code = CODE_BY_HTTP_STATUS[status] ?? "validation_failed";
    return new ApiError(code, SAFE_MESSAGE[code]);
  }
}

/**
 * Status of a Nest HttpException, or of an `http-errors` object thrown by
 * Express middleware (body-parser: 413 too large, 400 malformed JSON) —
 * only when that library marks it as safe to expose (client errors).
 */
function httpStatusOf(exception: unknown): number | undefined {
  if (exception instanceof HttpException) return exception.getStatus();
  if (exception && typeof exception === "object") {
    const candidate = exception as { status?: unknown; expose?: unknown };
    if (typeof candidate.status === "number" && candidate.expose === true) return candidate.status;
  }
  return undefined;
}
