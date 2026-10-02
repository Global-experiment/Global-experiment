import { createHash, randomBytes } from "node:crypto";

/** 256-bit opaque token for the session cookie; never stored as-is. */
export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/** What the database stores and looks up: a SHA-256 of the cookie token. */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
