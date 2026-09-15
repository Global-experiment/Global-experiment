import Link from "next/link";

interface NavHeaderProps {
  title: string;
  /** When present, renders the back-arrow sub-page pattern; omit for the app-bar pattern (Home). */
  backHref?: string;
}

export function NavHeader({ title, backHref }: NavHeaderProps) {
  return (
    <header className="flex items-center gap-3 border-b border-border-faint px-6 py-4">
      {backHref ? (
        <Link
          href={backHref}
          aria-label="Back"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control text-text-primary hover:bg-white/5"
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
    </header>
  );
}
