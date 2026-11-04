import type { ContentBlock } from "@/shared/content/types";
import { RichText } from "./RichText";

/**
 * Where a page's images come from: the public route (images of published
 * pages only) or, in the admin, the private one (drafts and older versions).
 */
export type ImageSource = "public" | "admin";
export const imageUrl = (imageId: string, source: ImageSource = "public") =>
  source === "admin" ? `/api/admin/cms/images/${imageId}` : `/api/cms/images/${imageId}`;

/** A bulleted or numbered list, in the body's 14px/18px rhythm (no Figma frame shows one: the body's own size and markers). */
export function ListBlock({ block, highlight, className = "" }: { block: Extract<ContentBlock, { kind: "list" }>; highlight?: string; className?: string }) {
  const List = block.ordered ? "ol" : "ul";
  return (
    <List className={`${block.ordered ? "list-decimal" : "list-disc"} pl-5 ${className}`}>
      {block.items.map((item, index) => (
        <li key={index}>
          <RichText text={item} highlight={highlight} />
        </li>
      ))}
    </List>
  );
}

/** An image at the column's width at most, with its description for screen readers; loaded only when scrolled to. */
export function ImageBlock({
  block,
  source = "public",
  className = "",
}: {
  block: Extract<ContentBlock, { kind: "image" }>;
  source?: ImageSource;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- an image of the content, served by the API with its own caching
    <img
      src={imageUrl(block.imageId, source)}
      alt={block.alt}
      loading="lazy"
      decoding="async"
      className={`block h-auto max-w-full rounded-control ${className}`}
    />
  );
}
