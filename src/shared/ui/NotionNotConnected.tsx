import { Container } from "./Container";
import { NavHeader } from "./NavHeader";

/**
 * Local development only (ADR 009, amended 2026-11-03): what Home and
 * Documentation show on a contributor's machine without the Notion values.
 * It says so plainly and shows no content; production never renders it
 * (`notionMissingLocally` is false there).
 */
export function NotionNotConnected({ title, backHref }: { title: string; backHref?: string }) {
  return (
    <main className="flex flex-1 flex-col pb-6">
      <NavHeader title={title} backHref={backHref} />
      <Container>
        <div role="status" data-notion-not-connected className="mt-4 rounded-control p-4 ring-1 ring-line">
          <p className="text-body font-bold text-text-primary">Notion isn&rsquo;t connected in this local setup</p>
          <p className="mt-2 text-lead text-text-primary">
            {title} is read from Notion on the live site. Locally it stays empty unless you add NOTION_API_KEY, NOTION_HOME_PAGE_ID and
            NOTION_DOCUMENTATION_DB_ID to .env.local (see CONTRIBUTING.md). Everything else works without them.
          </p>
        </div>
      </Container>
    </main>
  );
}
