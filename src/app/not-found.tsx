import { Button } from "@/shared/ui/Button";
import { ErrorState } from "@/shared/ui/ErrorState";

/** Site-wide 404 in the figma.pdf p32 error layout (static; no CMS access). */
export default function NotFound() {
  return (
    <ErrorState
      title="Page not found"
      code={404}
      message="The address you followed doesn’t match any page on this site."
      action={
        <Button href="/" size="compact">
          Home
        </Button>
      }
    />
  );
}
