import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Module } from "@nestjs/common";
import { LoggerModule } from "nestjs-pino";
import { stdSerializers, stdTimeFunctions } from "pino";
import { APP_CONFIG } from "../config/config.module.js";
import type { AppConfig } from "../config/env.js";

export const REQUEST_ID_HEADER = "x-request-id";
const WELL_FORMED_REQUEST_ID = /^[A-Za-z0-9._-]{8,128}$/;

/** Reuses a caller-supplied request id (proxy, Next.js) only if it is well-formed. */
export function resolveRequestId(req: IncomingMessage, res: ServerResponse): string {
  const incoming = req.headers[REQUEST_ID_HEADER];
  const id = typeof incoming === "string" && WELL_FORMED_REQUEST_ID.test(incoming) ? incoming : randomUUID();
  res.setHeader(REQUEST_ID_HEADER, id);
  return id;
}

/**
 * Credentials and personal data that must never be written to logs, even
 * if a future log call passes a whole request or record by mistake.
 */
export const REDACTED_PATHS = [
  "req.headers.cookie",
  "req.headers.authorization",
  'res.headers["set-cookie"]',
  "*.password",
  "*.passwordHash",
  "*.token",
  "*.tokenHash",
  "*.secret",
  "*.apiKey",
  "*.databaseUrl",
  "*.email",
  "*.phone",
];

/**
 * Drizzle's query errors embed the bound parameters ("params: …") in their
 * message and stack — values that will include emails and names once
 * People exist. The SQL text stays (it's parameterised); the values go.
 */
export function redactQueryParams(text: string): string {
  return text.replace(/(^|\n)(\s*)params: [^\n]*/g, "$1$2params: [redacted]");
}

type SerializedError = ReturnType<typeof stdSerializers.err> & { cause?: unknown };

export function serializeError(error: Error): SerializedError {
  const serialized = stdSerializers.err(error) as SerializedError;
  if (typeof serialized.message === "string") serialized.message = redactQueryParams(serialized.message);
  if (typeof serialized.stack === "string") serialized.stack = redactQueryParams(serialized.stack);
  return serialized;
}

@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        pinoHttp: {
          level: config.logLevel,
          base: { service: "api" },
          timestamp: stdTimeFunctions.isoTime,
          formatters: { level: (label: string) => ({ level: label }) },
          genReqId: resolveRequestId,
          redact: { paths: REDACTED_PATHS, censor: "[redacted]" },
          serializers: {
            // Path only: query strings can carry search terms about people.
            req: (req: { id: string; method: string; url: string }) => ({
              id: req.id,
              method: req.method,
              path: req.url.split("?")[0],
            }),
            res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
            err: serializeError,
          },
          customLogLevel: (_req: IncomingMessage, res: ServerResponse, error?: Error) =>
            error || res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info",
        },
      }),
    }),
  ],
})
export class LoggingModule {}
