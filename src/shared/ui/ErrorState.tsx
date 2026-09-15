interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
}

/**
 * Minimal, on-brand error presentation — no icon/illustration, no color
 * coding (consistent with the audited neutral visual language). Never
 * receives raw error details: callers must pass a safe, user-facing
 * message (see shared/errors/app-error.ts).
 */
export function ErrorState({
  title = "Something went wrong",
  message = "Please try again in a moment.",
  onRetry,
}: ErrorStateProps) {
  return (
    <div role="alert" className="px-6 py-16 text-center">
      <p className="text-base font-bold text-text-primary">{title}</p>
      <p className="mt-2 text-sm text-text-muted">{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-6 rounded-control border border-border-subtle px-4 py-2 text-sm font-semibold text-text-primary hover:bg-white/5"
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}
