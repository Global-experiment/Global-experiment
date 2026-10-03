"use client";

/** Unexpected rendering failure inside the admin: say so, offer a retry, keep the shell. */
export default function AdminError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="p-2">
      <h1 className="text-body font-bold">Something went wrong</h1>
      <p role="alert" className="mt-2 text-body text-text-muted">
        This admin screen failed to render. Your data hasn&rsquo;t been changed.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-3 inline-flex h-6 cursor-pointer items-center rounded-control px-2 text-body font-bold ring-1 ring-line focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary"
      >
        Try again
      </button>
    </main>
  );
}
