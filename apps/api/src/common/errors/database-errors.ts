import { ApiError, ConflictError, ValidationFailedError } from "./api-error.js";

interface PostgresErrorLike {
  code: string;
  constraint_name?: string;
  constraint?: string;
}

function findPostgresError(error: unknown): PostgresErrorLike | undefined {
  // Drizzle wraps driver errors; postgres-js and PGlite both expose the
  // SQLSTATE `code`. Walk the cause chain rather than depend on a class.
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current && typeof current === "object"; depth++) {
    const candidate = current as Partial<PostgresErrorLike> & { cause?: unknown };
    if (typeof candidate.code === "string" && /^[0-9A-Z]{5}$/.test(candidate.code)) {
      return candidate as PostgresErrorLike;
    }
    current = candidate.cause;
  }
  return undefined;
}

/**
 * Translates integrity-constraint violations into client-safe API errors.
 * Only the constraint *name* is exposed (it's schema metadata, not data),
 * never the offending values Postgres includes in its message/detail.
 */
export function toApiErrorFromDatabase(error: unknown): ApiError | undefined {
  const pg = findPostgresError(error);
  if (!pg) return undefined;
  const constraint = pg.constraint_name ?? pg.constraint;
  switch (pg.code) {
    case "23505": // unique_violation
      return new ConflictError("A record with the same unique value already exists.", constraint ? { constraint } : undefined);
    case "23503": // foreign_key_violation
      return new ConflictError("A referenced record does not exist or is still in use.", constraint ? { constraint } : undefined);
    case "23514": // check_violation
    case "23502": // not_null_violation
    case "22P02": // invalid_text_representation (e.g. malformed uuid)
      return new ValidationFailedError([{ path: constraint ?? "", message: "Value violates a data rule." }]);
    default:
      return undefined;
  }
}
