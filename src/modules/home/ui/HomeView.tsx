import type { HomeContent } from "@/modules/home/domain/types";
import { Button } from "@/shared/ui/Button";
import { Container } from "@/shared/ui/Container";
import { RichText } from "@/shared/ui/RichText";
import { HomeSections } from "./HomeSections";
import { homeActions, homePrimaryAction } from "./homeNavigation";

/**
 * Home's content under its header: the tagline, the action grid and the
 * Notion sections. Shared by the public page and the admin's public view
 * (admin-desktop.pdf p6), which has its own header — there the tagline is a
 * second-level heading, since the admin header carries the page's <h1>.
 */
export function HomeView({ content, taglineAs: Tagline = "h1" }: { content: HomeContent; taglineAs?: "h1" | "h2" }) {
  return (
    <Container>
      <Tagline className="mt-3.5 text-center text-lead text-text-primary">
        <RichText text={content.tagline} />
      </Tagline>

      {/*
        These routes are M1 navigation scaffolds: the route exists and
        can be reviewed visually. The underlying business action
        (persistence, payments, external integration) belongs to later
        milestones — see docs/architecture/decisions/008-route-shells.md.
      */}
      <nav aria-label="Main" className="mt-6 grid grid-cols-2 gap-2">
        <Button href={homePrimaryAction.href} icon={homePrimaryAction.icon} fullWidth className="col-span-2">
          {homePrimaryAction.label}
        </Button>
        {homeActions.map((action) => (
          <Button key={action.label} href={action.href} icon={action.icon} fullWidth>
            {action.label}
          </Button>
        ))}
      </nav>

      <div className="mt-6">
        <HomeSections content={content} />
      </div>
    </Container>
  );
}
