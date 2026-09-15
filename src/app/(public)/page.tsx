import Link from "next/link";
import { Button } from "@/shared/ui/Button";
import { Container } from "@/shared/ui/Container";
import { StickyActionBar } from "@/shared/ui/StickyActionBar";
import { ContributeIcon, DonateIcon, TreasuryIcon, WaitlistIcon } from "@/shared/ui/icons";
import { homeContent } from "./home-content";

const actionIcons = {
  waitlist: WaitlistIcon,
  contribute: ContributeIcon,
  donate: DonateIcon,
  treasury: TreasuryIcon,
} as const;

export default function Home() {
  return (
    <main className="flex flex-1 flex-col pb-24">
      <Container className="flex flex-col gap-8 py-10">
        <div className="text-center">
          <p className="text-base">
            <span className="font-bold text-text-primary">{homeContent.brand}</span>{" "}
            <span className="text-text-tertiary">{homeContent.eyebrow}</span>
          </p>
          <p className="mt-4 text-lg font-medium text-text-primary">{homeContent.subtitle}</p>
        </div>

        {/*
          These routes are M1 navigation scaffolds: the route exists and
          can be reviewed visually. The underlying business action
          (persistence, payments, external integration) belongs to later
          milestones — see docs/architecture/decisions/008-route-shells.md.
        */}
        <div className="grid grid-cols-2 gap-3">
          {homeContent.actions.map((action) => {
            const Icon = actionIcons[action.icon];
            return (
              <Button key={action.label} variant="secondary" href={action.href} icon={<Icon />} fullWidth>
                {action.label}
              </Button>
            );
          })}
        </div>

        <div className="border-t border-border-faint pt-8">
          <h2 className="text-sm font-bold text-text-primary">{homeContent.sectionLabel}</h2>

          <div className="mt-6 flex flex-col gap-6">
            {homeContent.subsections.map((subsection) => (
              <section key={subsection.heading}>
                <h3 className="text-sm font-bold text-text-primary">{subsection.heading}</h3>
                {subsection.paragraphs.map((paragraph, index) => (
                  <p key={index} className="mt-2 text-sm text-text-secondary">
                    {paragraph}
                  </p>
                ))}
              </section>
            ))}
          </div>

          <Link
            href={homeContent.documentationLink.href}
            className="mt-8 inline-block text-sm font-semibold text-text-primary underline underline-offset-2"
          >
            {homeContent.documentationLink.label}
          </Link>
        </div>
      </Container>

      <StickyActionBar>
        {(() => {
          const Icon = actionIcons[homeContent.primaryAction.icon];
          return (
            <Button variant="primary" href={homeContent.primaryAction.href} icon={<Icon />} fullWidth>
              {homeContent.primaryAction.label}
            </Button>
          );
        })()}
      </StickyActionBar>
    </main>
  );
}
