import { splitHighlights } from "@/shared/content/highlight";

/**
 * Wraps every occurrence of `query` in `text` with a <mark> in the inverse
 * tokens (same pair as ::selection). Plain React text nodes — no innerHTML.
 */
export function Highlight({ text, query }: { text: string; query?: string }) {
  if (!query?.trim()) return <>{text}</>;
  return (
    <>
      {splitHighlights(text, query).map((segment, index) =>
        segment.match ? (
          <mark key={index} className="bg-inverse-surface text-inverse-content">
            {segment.text}
          </mark>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </>
  );
}
