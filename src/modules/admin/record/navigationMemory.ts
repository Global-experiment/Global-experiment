"use client";

import { useEffect } from "react";

/**
 * Which admin page the visitor came from, in this tab: "Submit changes"
 * goes back there (the list with its search and filters, a linked
 * record…). A record opened directly (a bookmark, a new tab) has none, and
 * goes to its list instead.
 */
let current: string | null = null;
let previous: string | null = null;

/** AdminShell calls this on every page change. */
export function useRememberAdminPage(pathname: string) {
  useEffect(() => {
    if (pathname === current) return;
    previous = current;
    current = pathname;
  }, [pathname]);
}

export const cameFromAdminPage = () => previous !== null;
