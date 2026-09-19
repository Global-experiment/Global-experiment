"use client";

import { useEffect } from "react";
import { Button } from "@/shared/ui/Button";
import { ErrorState } from "@/shared/ui/ErrorState";
import { logger } from "@/shared/logging/logger";
import { rethrowNotFoundInErrorBoundary } from "@/shared/ui/rethrowNotFoundInErrorBoundary";

/**
 * Neutral error UI for CMS-backed routes that have no error boundary of
 * their own (Home). Never shows CMS content, error messages, or details —
 * only that the page is unavailable.
 */
export default function PublicRouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  rethrowNotFoundInErrorBoundary(error);

  useEffect(() => {
    logger.error("Public route error", { digest: error.digest });
  }, [error]);

  return (
    <ErrorState
      title="This page is temporarily unavailable"
      code={500}
      message="The page could not be loaded right now. Please try again in a moment."
      action={
        <Button onClick={reset} size="compact">
          Try again
        </Button>
      }
    />
  );
}
