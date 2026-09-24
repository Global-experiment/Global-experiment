"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "./icons";
import { readNavigationDepth, shouldUseHistoryBack } from "./navigationDepth";

interface HistoryBackButtonProps {
  /** Where to go if there's no useful in-app history to return to (a direct/external visit). */
  fallbackHref: string;
  className?: string;
}

const classes =
  "inline-flex size-10 shrink-0 items-center justify-center rounded-control text-text-primary " +
  "hover:ring-1 hover:ring-content-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary";

/**
 * Every back control in the app (client feedback item 21): returns to
 * whatever page was actually visited before this one — with its scroll
 * position, restored by the browser's native handling of a real
 * back/popstate navigation — instead of hard-coding a destination.
 *
 * The signal for "there's a previous in-app page" is the tab's in-app
 * navigation count (NavigationTracker / navigationDepth.ts), not
 * `window.history.length`: that also counts entries from before the visitor
 * arrived (an external referrer, a browser's blank new-tab entry), so a
 * route opened directly by URL would "go back" out of the app. For a
 * directly opened page the `<Link>` to `fallbackHref` (Home, or a section
 * index) rendered underneath is used — also the no-JS behavior — and
 * `router.back()` intercepts the click only when an earlier in-app page
 * exists.
 */
export function HistoryBackButton({ fallbackHref, className = "" }: HistoryBackButtonProps) {
  const router = useRouter();

  function handleClick(event: React.MouseEvent) {
    if (shouldUseHistoryBack(readNavigationDepth())) {
      event.preventDefault();
      router.back();
    }
  }

  return (
    <Link href={fallbackHref} onClick={handleClick} aria-label="Back" className={`${classes} ${className}`}>
      <Icon name="arrow_back" size={20} />
    </Link>
  );
}
