import type { Metadata } from "next";
import { Container } from "@/shared/ui/Container";
import { NavHeader } from "@/shared/ui/NavHeader";
import { ContributeEmailLink } from "./ContributeEmailLink";

export const metadata: Metadata = {
  title: "Contribute — Global Experiment",
};

const CONTRIBUTE_EMAIL = "contribute@globalexperiment.org";

/**
 * Genuinely functional per the Figma/IA audit: Contribute doesn't need the
 * later AI/email-ingestion workflow to be useful now — it's a real mailto
 * link, not a shell awaiting backend work.
 */
export default function ContributePage() {
  return (
    <main className="flex flex-1 flex-col">
      <NavHeader title="Contribute to the experiment" backHref="/" />
      <Container className="py-6">
        <ContributeEmailLink email={CONTRIBUTE_EMAIL} />
        <p className="mt-4 text-sm text-text-secondary">
          Send an email to the above email address stating what your expertises are and on what
          aspects you might contribute to the development of the platform.
        </p>
      </Container>
    </main>
  );
}
