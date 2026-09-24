import { Button } from "@/shared/ui/Button";
import { Container } from "@/shared/ui/Container";
import { RichText } from "@/shared/ui/RichText";
import { StickyActionBar } from "@/shared/ui/StickyActionBar";
import { ThemeToggle } from "@/shared/ui/ThemeToggle";
import { Icon } from "@/shared/ui/icons";
import { getHomeContent } from "@/modules/home/application/getHomeContent";
import { HomeSections } from "@/modules/home/ui/HomeSections";
import { homeActions, homePrimaryAction, homeWordmark } from "./home-navigation";

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
    <main className="flex flex-1 flex-col pb-16 md:pb-6">
      <Container>
        <div className="relative flex h-11 items-center justify-center text-body">
          <p className="flex items-center gap-1">
            <span className="font-bold text-text-primary">{homeWordmark.brand}</span>
            <span className="text-text-muted">{homeWordmark.eyebrow}</span>
          </p>
          {/* Temporary, review-only — see ThemeToggle.tsx. */}
          <div className="absolute top-1/2 right-0 -translate-y-1/2">
            <ThemeToggle />
          </div>
        </div>
        <h1 className="mt-3 text-center text-lead font-normal text-text-primary">
          <RichText text={content.tagline} />
        </h1>

        {/*
          These routes are M1 navigation scaffolds: the route exists and
          can be reviewed visually. The underlying business action
          (persistence, payments, external integration) belongs to later
          milestones — see docs/architecture/decisions/008-route-shells.md.
        */}
        <nav aria-label="Main" className="mt-6 grid grid-cols-2 gap-2">
          <Button
            href={homePrimaryAction.href}
            icon={<Icon name={homePrimaryAction.icon} />}
            fullWidth
            className="col-span-2"
          >
            {homePrimaryAction.label}
          </Button>
          {homeActions.map((action) => (
            <Button key={action.label} href={action.href} icon={<Icon name={action.icon} />} fullWidth>
              {action.label}
            </Button>
          ))}
        </nav>

        <div className="mt-6">
          <HomeSections content={content} />
        </div>
      </Container>

      <StickyActionBar className="md:hidden">
        <Button variant="primary" href={homePrimaryAction.href} icon={<Icon name={homePrimaryAction.icon} />} fullWidth>
          {homePrimaryAction.label}
        </Button>
      </StickyActionBar>
    </main>
  );
}
