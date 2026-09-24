import { logger } from "@/shared/logging/logger";

/**
 * Retries a `fetch` call when the *connection itself* fails to establish
 * (DNS/TCP/TLS-level — undici's `ConnectTimeoutError`/`ConnTimeoutError`,
 * `ECONNRESET`, etc.), never for a completed HTTP response, even an error
 * one (a 401/404/500 is real and retrying it wouldn't help — only a
 * request that never got a response is a candidate).
 *
 * Observed cause in practice: Notion's API resolves to more than one IP,
 * and this network's path to one of them can intermittently hang past the
 * connect timeout while the others answer immediately. A short retry gets
 * a fresh connection attempt (and typically a fresh DNS pick) instead of
 * surfacing a five-second stall as a full page error.
 */
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 300;

function isConnectionFailure(error: unknown): boolean {
  // undici throws TypeError("fetch failed") with the real cause nested in
  // `.cause` (ConnectTimeoutError, ECONNRESET, EAI_AGAIN, …). Matching on
  // that shape rather than a specific error class keeps this working
  // across undici/Node versions without importing its internals.
  if (!(error instanceof Error)) return false;
  const cause = (error as { cause?: unknown }).cause;
  if (error.name === "ConnectTimeoutError" || error.name === "ConnTimeoutError") return true;
  if (cause instanceof Error) {
    return (
      cause.name === "ConnectTimeoutError" ||
      cause.name === "ConnTimeoutError" ||
      "code" in cause && typeof cause.code === "string" && /^(ECONNRESET|ECONNREFUSED|EAI_AGAIN|UND_ERR_CONNECT_TIMEOUT)$/.test(cause.code)
    );
  }
  return false;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const resilientFetch: typeof fetch = async (input, init) => {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await fetch(input, init);
    } catch (error) {
      lastError = error;
      if (!isConnectionFailure(error) || attempt === MAX_ATTEMPTS) throw error;
      logger.warn("Retrying a Notion request after a connection failure", { attempt });
      await delay(RETRY_DELAY_MS * attempt);
    }
  }
  // Unreachable — the loop above always returns or throws — but keeps
  // TypeScript satisfied without a non-null assertion.
  throw lastError;
};
