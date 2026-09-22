"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "./icons";

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
 * `window.history.length > 1` is the signal that there's a previous entry
 * in *this tab's* history to go back to (it also counts entries from
 * outside the app, e.g. an external referrer, which is correct: a real
 * back button should return there too). A freshly opened tab, or a route
 * opened directly by URL, has no such entry — `<Link>` to `fallbackHref`
 * (Home, or a section index) is rendered underneath for that case and for
 * no-JS, and `router.back()` intercepts the click and takes over only when
 * real history exists.
 */
export function HistoryBackButton({ fallbackHref, className = "" }: HistoryBackButtonProps) {
  const router = useRouter();

  function handleClick(event: React.MouseEvent) {
    if (typeof window !== "undefined" && window.history.length > 1) {
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
