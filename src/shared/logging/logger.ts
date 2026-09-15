type LogLevel = "debug" | "info" | "warn" | "error";

type LogFields = Record<string, unknown>;

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function currentMinLevel(): LogLevel {
  const fromEnv = process.env.LOG_LEVEL as LogLevel | undefined;
  if (fromEnv && fromEnv in LEVEL_ORDER) return fromEnv;
  return process.env.NODE_ENV === "production" ? "info" : "debug";
}

function emit(level: LogLevel, message: string, fields?: LogFields) {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[currentMinLevel()]) return;

  const entry = {
    level,
    message,
    time: new Date().toISOString(),
    ...fields,
  };

  const line = JSON.stringify(entry);
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

/**
 * Structured JSON logger. Callers must never pass secrets, tokens, or
 * unnecessary personal data in `fields` — logs may be aggregated by
 * third-party hosting/observability tooling.
 */
export const logger = {
  debug: (message: string, fields?: LogFields) => emit("debug", message, fields),
  info: (message: string, fields?: LogFields) => emit("info", message, fields),
  warn: (message: string, fields?: LogFields) => emit("warn", message, fields),
  error: (message: string, fields?: LogFields) => emit("error", message, fields),
};
