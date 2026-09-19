"use client";

import { useEffect } from "react";
import { Button } from "@/shared/ui/Button";
import { ErrorState } from "@/shared/ui/ErrorState";
import { logger } from "@/shared/logging/logger";
import { rethrowNotFoundInErrorBoundary } from "@/shared/ui/rethrowNotFoundInErrorBoundary";

export default function DocumentationError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  rethrowNotFoundInErrorBoundary(error);

  useEffect(() => {
    // Never surface error.message to the UI — it may contain provider
    // details. Logged server/client-side only; see shared/errors.
    logger.error("Documentation route error", { digest: error.digest });
  }, [error]);

  return (
    <ErrorState
      title="Documentation is temporarily unavailable"
      code={500}
      message="The documentation could not be loaded right now. Please try again in a moment."
      action={
        <Button onClick={reset} size="compact">
          Try again
        </Button>
      }
    />
  );
}
