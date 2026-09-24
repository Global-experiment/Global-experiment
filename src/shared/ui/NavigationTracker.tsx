"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { readNavigationDepth, writeNavigationDepth } from "./navigationDepth";

/**
 * Renders nothing; counts client-side route changes in this tab so
 * HistoryBackButton can tell a genuine in-app "previous page" from history
 * the visitor brought with them (see navigationDepth.ts). Mounted once in
 * the root layout.
 */
export function NavigationTracker() {
  const pathname = usePathname();
  const lastPathname = useRef<string | null>(null);

  useEffect(() => {
    if (lastPathname.current === pathname) return;
    const isFirstPage = lastPathname.current === null;
    lastPathname.current = pathname;
    // A full page load starts the count over: whatever history exists
    // before this page is not in-app navigation we can safely go back to.
    writeNavigationDepth(isFirstPage ? 1 : readNavigationDepth() + 1);
  }, [pathname]);

  return null;
}
