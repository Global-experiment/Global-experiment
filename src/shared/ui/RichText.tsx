import Link from "next/link";
import type { RichText as RichTextModel } from "@/shared/content/types";
import { isInternalHref } from "@/shared/content/internalLinks";
import { Highlight } from "./Highlight";

const linkClassName =
  "underline underline-offset-2 hover:text-text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary";

/**
 * Renders editorial rich text. Links are the only formatting honoured —
 * bold/italic/color/etc. from the CMS never reach the page, so content
 * editors cannot restyle the Figma-defined design. `highlight` marks every
 * occurrence of a search query inside text and link labels (links stay links).
 */
export function RichText({ text, highlight }: { text: RichTextModel[]; highlight?: string }) {
  return (
    <>
      {text.map((item, index) => {
        if (item.kind === "text") {
          return (
            <span key={index}>
              <Highlight text={item.value} query={highlight} />
            </span>
          );
        }

        if (isInternalHref(item.href)) {
          return (
            <Link key={index} href={item.href} className={linkClassName}>
              <Highlight text={item.value} query={highlight} />
            </Link>
          );
        }
        if (item.href.startsWith("mailto:")) {
          return (
            <a key={index} href={item.href} className={linkClassName}>
              <Highlight text={item.value} query={highlight} />
            </a>
          );
        }
        return (
          <a key={index} href={item.href} className={linkClassName} target="_blank" rel="noopener noreferrer">
            <Highlight text={item.value} query={highlight} />
          </a>
        );
      })}
    </>
  );
}
