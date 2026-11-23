import type { ReportSubmissionDraft } from "@/shared/navigation/reportSubmission";

/** How a send ended: saved, or why not (each has its own message). */
export type ReportOutcome = "sent" | "rate_limited" | "bot_check_failed" | "refused" | "unavailable";

/** What the visitor reads when a send fails (plain, short, no technical details). The text is always kept. */
export const REPORT_ERROR_MESSAGES: Record<Exclude<ReportOutcome, "sent">, string> = {
  rate_limited: "You've sent several reports in a short time. Please wait a few minutes and try again.",
  bot_check_failed: "We couldn't confirm you're a person. Please try again.",
  refused: "Your text couldn't be sent. Please check it and try again.",
  unavailable: "Sending isn't available right now. Your text is kept, so you can try again later.",
};

const SUBMIT_PATH = "/api/feedback/submissions";
const CONFIG_PATH = "/api/feedback/config";

/** The outcome of the API's answer (201 saved; 429 too many; 403 bot check; 400/413 refused; anything else unavailable). */
export function outcomeOf(status: number): ReportOutcome {
  if (status === 201) return "sent";
  if (status === 429) return "rate_limited";
  if (status === 403) return "bot_check_failed";
  if (status === 400 || status === 413) return "refused";
  return "unavailable";
}

/** Sends a submission with its bot check token, same-origin (next.config.ts rewrites /api/feedback to the API). */
export async function submitReport(draft: ReportSubmissionDraft, token: string, send: typeof fetch = fetch): Promise<ReportOutcome> {
  try {
    const response = await send(SUBMIT_PATH, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ ...draft, token }),
    });
    return outcomeOf(response.status);
  } catch {
    return "unavailable";
  }
}

/** The bot check's site key, or null when sending is unavailable (no key on the server, or the API is down). */
export async function fetchBotCheckSiteKey(send: typeof fetch = fetch): Promise<string | null> {
  try {
    const response = await send(CONFIG_PATH, { headers: { accept: "application/json" }, cache: "no-store" });
    if (!response.ok) return null;
    const body = (await response.json()) as { siteKey?: unknown };
    return typeof body.siteKey === "string" && body.siteKey ? body.siteKey : null;
  } catch {
    return null;
  }
}
