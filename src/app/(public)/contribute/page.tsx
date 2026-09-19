import type { Metadata } from "next";
import { Container } from "@/shared/ui/Container";
import { NavHeader } from "@/shared/ui/NavHeader";
import { ContributeEmailLink } from "./ContributeEmailLink";

export const metadata: Metadata = {
  title: "Contribute — Global Experiment",
};

const CONTRIBUTE_EMAIL = "contribute@globalexperiment.org";

/**
 * Genuinely functional per the Figma/IA audit (figma.pdf p31): a real
 * mailto link with a copy control, then one explanatory paragraph.
 */
export default function ContributePage() {
  return (
    <main className="flex flex-1 flex-col pb-6">
      <NavHeader title="Contribute to the experiment" backHref="/" />
      <Container className="pt-1">
        <ContributeEmailLink email={CONTRIBUTE_EMAIL} />
        <p className="mt-5 text-body text-text-primary">
          Send an email to the above email address stating what your expertises are and on what
          aspects you might contribute to the development of the platform.
        </p>
      </Container>
    </main>
  );
}
