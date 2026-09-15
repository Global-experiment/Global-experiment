const NOT_FOUND_DIGEST = "NEXT_HTTP_ERROR_FALLBACK;404";

/**
 * Call at the top of every route segment's error.tsx. Without this, a
 * client-side error boundary intercepts the special error Next.js uses to
 * implement notFound()/redirect(), and the response is served with an
 * HTTP 200 status instead of 404 in self-hosted (`next start`) deployments
 * — confirmed by direct testing against this app's own Documentation
 * route; not merely a hypothetical Next.js quirk. Re-throwing lets the
 * framework's own not-found handling take over correctly.
 */
export function rethrowNotFoundInErrorBoundary(error: Error & { digest?: string }): void {
  if (error.digest === NOT_FOUND_DIGEST) {
    throw error;
  }
}
