"use client";

import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

/**
 * The page the visitor is on right now (path + hash), used as the
 * `source` of Send feedback / Report issue links. The hash is read on the
 * client only (servers never see it), so the server render uses the path.
 */
export function useCurrentSourcePage(): string {
  const pathname = usePathname();
  const hash = useSyncExternalStore(
    subscribe,
    () => window.location.hash,
    () => "",
  );
  return `${pathname}${hash}`;
}
