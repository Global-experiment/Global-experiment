/**
 * A divider that extends through the page's 8px gutters to the full width
 * of the application content area — never the full browser window on
 * desktop, which stays centered in the page column (client feedback item
 * 6). Use inside a `Container`; do not use it for a row's own bottom
 * stroke (e.g. Documentation accordion rows), which stays within the
 * content width — see ArticleAccordionItem.
 */
export function FullBleedSeparator({ className = "" }: { className?: string }) {
  return (
    <hr
      aria-hidden="true"
      className={`-mx-gutter w-[calc(100%+var(--spacing-gutter)*2)] border-line ${className}`}
    />
  );
}
