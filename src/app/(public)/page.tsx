import { Button } from "@/shared/ui/Button";
import { StickyActionBar } from "@/shared/ui/StickyActionBar";
import { NavHeader } from "@/shared/ui/NavHeader";
import { getHomeContent } from "@/modules/home/application/getHomeContent";
import { homePrimaryAction, homeWordmark } from "@/modules/home/ui/homeNavigation";
import { HomeView } from "@/modules/home/ui/HomeView";

// Editorial content is read live from Notion on every request, so edits in
// Notion appear on the next refresh with no redeploy. No route cache, no
// data cache, no build-time snapshot. Deliberately no Suspense boundary
// either (ADR 007): it would commit an HTTP 200 before a Notion failure
// could surface as a real error status.
export const dynamic = "force-dynamic";

/**
 * figma.pdf p1 (mobile, 2026-09-24 export): 44px identity row, 16px
 * centered tagline, a full-width 40px "Join waitlist" row, a 2×2 grid of
 * 40px outlined actions (8px gaps), then 24px straight into the
 * left-aligned sections — the earlier rule under the grid is gone in this
 * export. The sticky bottom CTA is mobile-only: the client asked for it to
 * be removed on desktop, with no space reserved for it (`md:` = 768px).
 */
export default async function Home() {
  const content = await getHomeContent();

  return (
    <main className="flex flex-1 flex-col md:pb-6">
      {/* The shared header (client review 2026-10-21): the wordmark, then Share and ⋮ — no theme toggle. */}
      <NavHeader title={homeWordmark.brand} brand={{ name: homeWordmark.brand, eyebrow: homeWordmark.eyebrow }} shareUrl="/" />
      <HomeView content={content} />

      <StickyActionBar className="md:hidden">
        <Button variant="primary" href={homePrimaryAction.href} icon={homePrimaryAction.icon} fullWidth>
          {homePrimaryAction.label}
        </Button>
      </StickyActionBar>
    </main>
  );
}
