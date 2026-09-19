import { Button } from "@/shared/ui/Button";
import { Container } from "@/shared/ui/Container";
import { RichText } from "@/shared/ui/RichText";
import { StickyActionBar } from "@/shared/ui/StickyActionBar";
import { Icon } from "@/shared/ui/icons";
import { getHomeContent } from "@/modules/home/application/getHomeContent";
import { HomeSections } from "@/modules/home/ui/HomeSections";
import {
  homeActions,
  homeDocumentationLink,
  homePrimaryAction,
  homeWordmark,
} from "./home-navigation";

// Editorial content is read live from Notion on every request, so edits in
// Notion appear on the next refresh with no redeploy. No route cache, no
// data cache, no build-time snapshot. Deliberately no Suspense boundary
// either (ADR 007): it would commit an HTTP 200 before a Notion failure
// could surface as a real error status.
export const dynamic = "force-dynamic";

/**
 * figma.pdf p1 (mobile) / p33 (desktop) — one layout, one column width
 * token: 44px identity row, 16px centered tagline, 2×2 grid of 40px
 * outlined actions, 1px rule, left-aligned sections, white bottom CTA.
 */
export default async function Home() {
  const content = await getHomeContent();

  return (
    <main className="flex flex-1 flex-col pb-16">
      <Container>
        <p className="flex h-11 items-center justify-center gap-1 text-body">
          <span className="font-bold text-text-primary">{homeWordmark.brand}</span>
          <span className="text-text-muted">{homeWordmark.eyebrow}</span>
        </p>
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
          {homeActions.map((action) => (
            <Button key={action.label} href={action.href} icon={<Icon name={action.icon} />} fullWidth>
              {action.label}
            </Button>
          ))}
        </nav>

        <hr className="mt-2 border-line" />

        <div className="mt-4">
          <HomeSections content={content} />
        </div>

        <nav aria-label="Documentation" className="mt-[1.125rem]">
          <Button href={homeDocumentationLink.href} icon={<Icon name={homeDocumentationLink.icon} />} fullWidth>
            {homeDocumentationLink.label}
          </Button>
        </nav>
      </Container>

      <StickyActionBar>
        <Button variant="primary" href={homePrimaryAction.href} icon={<Icon name={homePrimaryAction.icon} />} fullWidth>
          {homePrimaryAction.label}
        </Button>
      </StickyActionBar>
    </main>
  );
}
