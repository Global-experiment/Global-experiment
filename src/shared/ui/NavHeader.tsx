import Link from "next/link";
import { Container } from "./Container";

interface NavHeaderProps {
  title: string;
  /** When present, renders the back-arrow sub-page pattern; omit for the app-bar pattern (Home). */
  backHref?: string;
}

export function NavHeader({ title, backHref }: NavHeaderProps) {
  return (
    <header className="border-b border-border-faint py-4">
      <Container className="flex items-center gap-3">
        {backHref ? (
          <Link
            href={backHref}
            aria-label="Back"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-text-primary hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </Link>
        ) : null}
        <h1 className="text-base font-bold text-text-primary">{title}</h1>
      </Container>
    </header>
  );
}
