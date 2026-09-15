import { Button } from "@/shared/ui/Button";
import { Container } from "@/shared/ui/Container";
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
          Waitlist/Contribute/Donate/Treasury routes are not built in M1 —
          rendered per the approved Figma layout but disabled (not linked to
          a 404) rather than omitted, so the page structure matches the
          design now and only needs an href + `disabled` flip later.
        */}
        <div className="grid grid-cols-2 gap-3">
          {homeContent.actions.map((action) => {
            const Icon = actionIcons[action.icon];
            return (
              <Button key={action.label} variant="secondary" disabled icon={<Icon />} fullWidth>
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
        </div>
      </Container>

      <div className="fixed inset-x-0 bottom-0 border-t border-border-faint bg-surface-base">
        <Container className="py-3">
          {(() => {
            const Icon = actionIcons[homeContent.primaryAction.icon];
            return (
              <Button variant="primary" disabled icon={<Icon />} fullWidth>
                {homeContent.primaryAction.label}
              </Button>
            );
          })()}
        </Container>
      </div>
    </main>
  );
}
