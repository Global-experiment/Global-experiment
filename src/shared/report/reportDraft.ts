import { sanitizeSourcePage, type ReportKind } from "@/shared/navigation/sourcePage";
import { knownTypes } from "./reportKinds";

/**
 * Unsent report paragraphs survive leaving the composer and coming back in
 * the same browser session (Review #3 item 6 — the client chose session
 * caching over a "discard?" prompt). sessionStorage only: it ends with the
 * tab/session and is never shared across tabs or written to disk long-term.
 *
 * One draft per kind AND origin page, so an issue started from one
 * Documentation article doesn't overwrite one started from Treasury. Only
 * the paragraph and its qualification types are stored — nothing else.
 *
 * M1 sends nothing anywhere, so nothing ever counts as a successful
 * submission yet: `clearReportDraft` exists for the real M2 submit and is
 * deliberately not called by the inert demo CTA.
 */

const PREFIX = "ge-report-draft:v1";
const MAX_MESSAGE = 20_000;

export interface ReportDraftData {
  message: string;
  types: string[];
}

export function reportDraftKey(kind: ReportKind, sourcePage: string | null | undefined): string {
  return `${PREFIX}:${kind}:${sanitizeSourcePage(sourcePage) ?? ""}`;
}

export function serializeReportDraft(data: ReportDraftData): string {
  return JSON.stringify({ message: data.message.slice(0, MAX_MESSAGE), types: data.types });
}

/** Defensive parse: anything malformed (or from another version) reads as no draft. */
export function parseReportDraft(kind: ReportKind, raw: string | null): ReportDraftData | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as { message?: unknown; types?: unknown };
    if (typeof value.message !== "string") return null;
    const types = Array.isArray(value.types) ? value.types.filter((label): label is string => typeof label === "string") : [];
    return { message: value.message.slice(0, MAX_MESSAGE), types: knownTypes(kind, types) };
  } catch {
    return null;
  }
}

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    // Blocked storage (privacy settings, sandboxed frames) — drafts just don't persist.
    return null;
  }
}

export function readReportDraftRaw(key: string): string | null {
  try {
    return storage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/** Saves the draft; an empty paragraph removes it instead of keeping an empty entry. */
export function writeReportDraft(key: string, data: ReportDraftData): void {
  try {
    const store = storage();
    if (!store) return;
    if (data.message.trim() === "") store.removeItem(key);
    else store.setItem(key, serializeReportDraft(data));
  } catch {
    // Quota exceeded / storage unavailable: keep working without persistence.
  }
}

/** For the real (M2) submission only — call after the server confirms receipt. */
export function clearReportDraft(key: string): void {
  try {
    storage()?.removeItem(key);
  } catch {
    // Nothing to clear.
  }
}
