import Link from "next/link";
import type { RichText as RichTextModel } from "@/shared/content/types";
import { isInternalHref } from "@/shared/content/internalLinks";

const linkClassName =
  "underline underline-offset-2 hover:text-text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";

/**
 * Renders editorial rich text. Links are the only formatting honoured —
 * bold/italic/color/etc. from the CMS never reach the page, so content
 * editors cannot restyle the Figma-defined design.
 */
export function RichText({ text }: { text: RichTextModel[] }) {
  return (
    <>
      {text.map((item, index) => {
        if (item.kind === "text") return <span key={index}>{item.value}</span>;

        if (isInternalHref(item.href)) {
          return (
            <Link key={index} href={item.href} className={linkClassName}>
              {item.value}
            </Link>
          );
        }
        if (item.href.startsWith("mailto:")) {
          return (
            <a key={index} href={item.href} className={linkClassName}>
              {item.value}
            </a>
          );
        }
        return (
          <a key={index} href={item.href} className={linkClassName} target="_blank" rel="noopener noreferrer">
            {item.value}
          </a>
        );
      })}
    </>
  );
}
