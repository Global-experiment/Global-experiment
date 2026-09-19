import type { ReactNode } from "react";
import { Container } from "./Container";

interface ErrorStateProps {
  /** Short bold label, e.g. "Article not found". */
  title: string;
  /** HTTP status shown muted beside the title, as in figma.pdf p32 ("Invalid request  Error 400"). */
  code: 400 | 404 | 500;
  /** One or two plain sentences. Never raw error details. */
  message: string;
  /** Optional action rendered under the message (a Button). */
  action?: ReactNode;
}

/**
 * The generic error layout from figma.pdf p32: a header row reading
 * "Error", then "<title> Error <code>", then a 16px message. No icon, no
 * illustration, no color. Callers pass safe, user-facing copy only (see
 * shared/errors/app-error.ts).
 */
export function ErrorState({ title, code, message, action }: ErrorStateProps) {
  return (
    <main className="flex flex-1 flex-col">
      <Container>
        <div role="alert">
          <div className="flex h-11 items-center">
            <h1 className="text-body font-bold text-text-primary">Error</h1>
          </div>
          <p className="text-body">
            <span className="font-bold text-text-primary">{title}</span>{" "}
            <span className="text-text-muted">Error {code}</span>
          </p>
          <p className="mt-3 text-lead text-text-primary">{message}</p>
        </div>
        {action ? <div className="mt-5">{action}</div> : null}
      </Container>
    </main>
  );
}
