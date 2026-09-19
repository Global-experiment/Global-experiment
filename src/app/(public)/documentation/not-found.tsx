import { Button } from "@/shared/ui/Button";
import { ErrorState } from "@/shared/ui/ErrorState";

export default function DocumentationNotFound() {
  return (
    <ErrorState
      title="Article not found"
      code={404}
      message="This page doesn’t exist or is no longer published."
      action={
        <Button href="/documentation" size="compact">
          Back to Documentation
        </Button>
      }
    />
  );
}
