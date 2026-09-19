"use client";

import { useState } from "react";
import { Button } from "@/shared/ui/Button";
import { Container } from "@/shared/ui/Container";
import { NavHeader } from "@/shared/ui/NavHeader";
import { StickyActionBar } from "@/shared/ui/StickyActionBar";
import { InertActionNotice } from "@/shared/ui/InertActionNotice";
import { Icon } from "@/shared/ui/icons";

// Deliberately permissive: the M2 backend owns real validation. This only
// reproduces the "Invalid email address" hint state from figma.pdf p20.
const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * M1 navigation scaffold (figma.pdf p19–20): 40px white-outlined email
 * field, explanatory copy, bottom CTA that is gray until something is
 * typed. The waitlist itself (encrypted storage, confirmation email) is
 * M2 — submitting persists nothing and never pretends to succeed. See
 * docs/architecture/decisions/008-route-shells.md.
 */
export default function WaitlistPage() {
  const [email, setEmail] = useState("");
  const [invalid, setInvalid] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  function submit() {
    if (!LOOKS_LIKE_EMAIL.test(email.trim())) {
      setInvalid(true);
      setSubmitted(false);
      return;
    }
    setInvalid(false);
    setSubmitted(true);
  }

  return (
    <main className="flex flex-1 flex-col pb-16">
      <NavHeader title="Join the waitlist" backHref="/" />
      <Container className="pt-1">
        <label htmlFor="waitlist-email" className="sr-only">
          Email
        </label>
        <input
          id="waitlist-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            setInvalid(false);
          }}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? "waitlist-email-error" : undefined}
          placeholder="Email"
          className="h-10 w-full rounded-control border border-white bg-transparent px-2 text-body text-text-primary placeholder:text-text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        />
        {invalid ? (
          <p id="waitlist-email-error" className="mt-1 flex items-center gap-1 text-meta text-text-primary">
            <Icon name="warning" size={16} />
            Invalid email address
          </p>
        ) : null}
        <p className="mt-3 text-body text-text-primary">
          The email address provided for the waitlist will only be used once, to notify you when
          the platform is up and running. It will not be used for any other purpose, and no
          further emails will be sent. The email address is also encrypted and will not be
          accessible to admins.
        </p>
        {submitted ? <InertActionNotice /> : null}
      </Container>

      <StickyActionBar>
        {email.trim() === "" ? (
          <Button disabled fullWidth>
            Join waitlist
          </Button>
        ) : (
          <Button variant="primary" fullWidth onClick={submit}>
            Join waitlist
          </Button>
        )}
      </StickyActionBar>
    </main>
  );
}
