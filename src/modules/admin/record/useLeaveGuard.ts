"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

export const LEAVE_MESSAGE = "You have changes that aren't submitted. Leave this page and lose them?";

/**
 * No autosave (client, 2026-10-21): while a record has unsubmitted changes,
 * leaving asks first — closing or reloading the tab (the browser's own
 * prompt) and following any link in the admin (the menu, Back, a linked
 * record). `release()` lets the page navigate after a successful submit.
 */
export function useLeaveGuard(dirty: boolean) {
  const router = useRouter();
  const released = useRef(false);

  useEffect(() => {
    if (!dirty) {
      released.current = false;
      return;
    }
    const guarding = () => !released.current;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!guarding()) return;
      event.preventDefault();
      event.returnValue = "";
    };
    const click = (event: MouseEvent) => {
      if (!guarding() || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin || (url.pathname === window.location.pathname && url.search === window.location.search)) return;
      // Stop the link before Next's router sees it; go on only if the visitor agrees.
      event.preventDefault();
      event.stopPropagation();
      if (window.confirm(LEAVE_MESSAGE)) {
        released.current = true;
        router.push(`${url.pathname}${url.search}${url.hash}`);
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", click, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", click, true);
    };
  }, [dirty, router]);

  return {
    /** The changes were submitted (or discarded on purpose): navigate freely. */
    release: () => {
      released.current = true;
    },
  };
}
