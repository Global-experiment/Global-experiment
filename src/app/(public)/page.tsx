import { connection } from "next/server";
import { Button } from "@/shared/ui/Button";
import { StickyActionBar } from "@/shared/ui/StickyActionBar";
import { NavHeader } from "@/shared/ui/NavHeader";
import { getHomeContent } from "@/modules/home/application/getHomeContent";
import { homePrimaryAction, homeWordmark } from "@/modules/home/ui/homeNavigation";
import { HomeView } from "@/modules/home/ui/HomeView";

/**
 * figma.pdf p1 (mobile, 2026-09-24 export): 44px identity row, 16px
 * centered tagline, a full-width 40px "Join waitlist" row, a 2×2 grid of
 * 40px outlined actions (8px gaps), then 24px straight into the
 * left-aligned sections — the earlier rule under the grid is gone in this
 * export. The sticky bottom CTA is mobile-only: the client asked for it to
 * be removed on desktop, with no space reserved for it (`md:` = 768px).
 *
 * The content is the published Home from the native API (ADR 020), cached
 * under the `home` tag and revalidated whenever Home is published. The page
 * renders per request (`connection()`, never at build time); deliberately no
 * Suspense boundary (ADR 007): an API failure surfaces as a real error status.
 */
export default async function Home() {
  await connection();
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
