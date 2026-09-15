"use client";

import { useState } from "react";
import { Button } from "@/shared/ui/Button";
import { Container } from "@/shared/ui/Container";
import { NavHeader } from "@/shared/ui/NavHeader";
import { StickyActionBar } from "@/shared/ui/StickyActionBar";
import { InertActionNotice } from "@/shared/ui/InertActionNotice";
import { WaitlistIcon } from "@/shared/ui/icons";

/**
 * M1 navigation scaffold: the route exists and can be reviewed visually.
 * The waitlist itself (Supabase-backed encrypted storage, confirmation
 * email) is M2 — submitting here does not persist anything or pretend to
 * succeed. See docs/architecture/decisions/008-route-shells.md.
 */
export default function WaitlistPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  return (
    <main className="flex flex-1 flex-col pb-24">
      <NavHeader title="Join the waitlist" backHref="/" />
      <Container className="flex flex-col gap-4 py-6">
        <label htmlFor="waitlist-email" className="sr-only">
          Email
        </label>
        <input
          id="waitlist-email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="Email"
          className="w-full rounded-control border border-border-subtle bg-transparent px-4 py-3 text-sm text-text-primary placeholder:text-text-muted"
        />
        <p className="text-sm text-text-secondary">
          The email address provided for the waitlist will only be used once, to notify you when
          the platform is up and running. It will not be used for any other purpose, and no
          further emails will be sent. The email address is also encrypted and will not be
          accessible to admins.
        </p>
        {submitted ? <InertActionNotice /> : null}
      </Container>

      <StickyActionBar>
        <Button variant="primary" icon={<WaitlistIcon />} fullWidth onClick={() => setSubmitted(true)}>
          Join waitlist
        </Button>
      </StickyActionBar>
    </main>
  );
}
