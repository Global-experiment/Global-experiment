import Link from "next/link";
import { Button } from "@/shared/ui/Button";
import { Container } from "@/shared/ui/Container";
import { RichText } from "@/shared/ui/RichText";
import { StickyActionBar } from "@/shared/ui/StickyActionBar";
import { ContributeIcon, DonateIcon, TreasuryIcon, WaitlistIcon } from "@/shared/ui/icons";
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

const actionIcons = {
  waitlist: WaitlistIcon,
  contribute: ContributeIcon,
  donate: DonateIcon,
  treasury: TreasuryIcon,
} as const;

export default async function Home() {
  const content = await getHomeContent();
  const PrimaryIcon = actionIcons[homePrimaryAction.icon];

  return (
    <main className="flex flex-1 flex-col pb-24">
      <Container className="flex flex-col gap-8 py-10">
        <div className="text-center">
          <p className="text-base">
            <span className="font-bold text-text-primary">{homeWordmark.brand}</span>{" "}
            <span className="text-text-tertiary">{homeWordmark.eyebrow}</span>
          </p>
          <h1 className="mt-4 text-lg font-medium text-text-primary">
            <RichText text={content.tagline} />
          </h1>
        </div>

        {/*
          These routes are M1 navigation scaffolds: the route exists and
          can be reviewed visually. The underlying business action
          (persistence, payments, external integration) belongs to later
          milestones — see docs/architecture/decisions/008-route-shells.md.
        */}
        <div className="grid grid-cols-2 gap-3">
          {homeActions.map((action) => {
            const Icon = actionIcons[action.icon];
            return (
              <Button key={action.label} variant="secondary" href={action.href} icon={<Icon />} fullWidth>
                {action.label}
              </Button>
            );
          })}
        </div>

        <div className="border-t border-border-faint pt-8">
          <HomeSections content={content} />

          <Link
            href={homeDocumentationLink.href}
            className="mt-8 inline-block text-sm font-semibold text-text-primary underline underline-offset-2"
          >
            {homeDocumentationLink.label}
          </Link>
        </div>
      </Container>

      <StickyActionBar>
        <Button variant="primary" href={homePrimaryAction.href} icon={<PrimaryIcon />} fullWidth>
          {homePrimaryAction.label}
        </Button>
      </StickyActionBar>
    </main>
  );
}
