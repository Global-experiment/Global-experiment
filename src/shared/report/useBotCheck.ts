"use client";

import { useCallback, useEffect, useRef } from "react";
import type { ReportKind } from "@/shared/navigation/sourcePage";
import { fetchBotCheckSiteKey } from "./submitReport";

/** The part of Cloudflare Turnstile's browser API the composer uses (explicit rendering, run on send). */
interface TurnstileApi {
  render(container: HTMLElement, options: Record<string, unknown>): string | null | undefined;
  execute(widget: string): void;
  reset(widget: string): void;
  remove(widget: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

/** Cloudflare's script, allowed on /feedback and /issue only (src/shared/security/headers.ts, ADR 023). */
export const TURNSTILE_SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

/** Why no token came back: the check failed (the visitor may retry), or it couldn't run at all. */
export class BotCheckError extends Error {
  constructor(readonly reason: "failed" | "unavailable") {
    super(reason);
  }
}

let loading: Promise<TurnstileApi> | null = null;

/** Adds Cloudflare's script once per page; a failed load can be tried again. */
function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = TURNSTILE_SCRIPT;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new BotCheckError("unavailable")));
    script.onerror = () => {
      loading = null;
      script.remove();
      reject(new BotCheckError("unavailable"));
    };
    document.head.append(script);
  });
  return loading;
}

type Waiting = { resolve: (token: string) => void; reject: (error: BotCheckError) => void };

/**
 * The bot check of a report (ADR 023). Nothing reaches Cloudflare until the visitor sends: the first send loads
 * its script and prepares the check in `containerRef`, which stays empty unless Cloudflare needs the visitor to
 * interact. Each send gets a fresh token (a token works once).
 */
export function useBotCheck(action: ReportKind) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widget = useRef<{ api: TurnstileApi; id: string } | null>(null);
  const pending = useRef<Waiting | null>(null);

  const settle = useCallback((outcome: { token: string } | { error: BotCheckError }) => {
    const waiting = pending.current;
    pending.current = null;
    if (!waiting) return;
    if ("token" in outcome) waiting.resolve(outcome.token);
    else waiting.reject(outcome.error);
  }, []);

  useEffect(
    () => () => {
      if (widget.current) widget.current.api.remove(widget.current.id);
      widget.current = null;
      settle({ error: new BotCheckError("unavailable") });
    },
    [settle],
  );

  /** Renders the check once; null when it can't run (no site key on the server, or Cloudflare unreachable). */
  const prepare = useCallback(async () => {
    if (widget.current) return widget.current;
    const siteKey = await fetchBotCheckSiteKey();
    if (!siteKey || !containerRef.current) return null;
    const api = await loadTurnstile().catch(() => null);
    if (!api || !containerRef.current || widget.current) return widget.current;
    const id = api.render(containerRef.current, {
      sitekey: siteKey,
      action,
      execution: "execute",
      appearance: "interaction-only",
      size: "flexible",
      theme: "auto",
      callback: (token: string) => settle({ token }),
      "error-callback": () => {
        settle({ error: new BotCheckError("failed") });
        return true;
      },
      "expired-callback": () => settle({ error: new BotCheckError("failed") }),
      "timeout-callback": () => settle({ error: new BotCheckError("failed") }),
    });
    widget.current = id ? { api, id } : null;
    return widget.current;
  }, [action, settle]);

  /** A fresh token for one send. */
  const run = useCallback(async () => {
    const ready = await prepare();
    if (!ready) throw new BotCheckError("unavailable");
    return new Promise<string>((resolve, reject) => {
      pending.current = { resolve, reject };
      ready.api.reset(ready.id);
      ready.api.execute(ready.id);
    });
  }, [prepare]);

  return { containerRef, run };
}
