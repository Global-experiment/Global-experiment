"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe, type Appearance, type Stripe } from "@stripe/stripe-js";
import { DONATE_COPY } from "@/shared/donate/copy";
import { Button } from "@/shared/ui/Button";
import { Sheet } from "@/shared/ui/Sheet";

const copy = DONATE_COPY.card;

/** One Stripe.js per publishable key for the page's lifetime (loadStripe adds the script once). */
const stripeByKey = new Map<string, Promise<Stripe | null>>();
function stripeFor(publishableKey: string): Promise<Stripe | null> {
  let promise = stripeByKey.get(publishableKey);
  if (!promise) {
    promise = loadStripe(publishableKey).catch(() => null);
    stripeByKey.set(publishableKey, promise);
  }
  return promise;
}

/** Stripe's fields in the page's own tokens (both themes), read when the sheet opens. */
function appearance(): Appearance {
  const style = getComputedStyle(document.documentElement);
  const token = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  // Dark is the site's default; the light theme sets data-theme="light" (ThemeToggle).
  const dark = document.documentElement.dataset.theme !== "light";
  return {
    theme: dark ? "night" : "stripe",
    variables: {
      colorPrimary: token("--color-text-primary", dark ? "#ffffff" : "#000000"),
      colorBackground: token("--color-surface-base", dark ? "#000000" : "#ffffff"),
      colorText: token("--color-text-primary", dark ? "#ffffff" : "#000000"),
      colorTextSecondary: token("--color-text-muted", "#a3a3a3"),
      colorDanger: token("--color-text-primary", dark ? "#ffffff" : "#000000"),
      fontFamily: "Inter, system-ui, sans-serif",
      fontSizeBase: "14px",
      borderRadius: "4px",
      spacingUnit: "4px",
    },
    rules: {
      ".Input": { border: `1px solid ${token("--color-line", "#484848")}`, boxShadow: "none" },
      ".Input:focus": { border: `1px solid ${token("--color-text-primary", "#ffffff")}`, boxShadow: "none" },
    },
  };
}

export interface CardIntent {
  clientSecret: string;
  reference: string;
}

interface CardPaymentSheetProps {
  intent: CardIntent | null;
  publishableKey: string;
  /** "$20", "CHF 50" — shown in the intro and on the button. */
  amountLabel: string;
  /** The donate page's choice, carried to the thank-you page (and back to /donate on failure). */
  choiceQuery: string;
  onClose: () => void;
}

/**
 * One-off card donation on the donate page itself (decided 2026-10-19,
 * donations.checkout = embedded): Stripe's Payment Element limited to card
 * fields — no email, no wallets (Apple Pay, Google Pay, PayPal and SEPA keep
 * their own rows and Stripe Checkout). The card details go from the
 * browser to Stripe; our API only creates the PaymentIntent and the webhook
 * records the donation (payment_intent.succeeded), as for Checkout. The
 * thank-you page shows the reference instead of an email receipt.
 */
export function CardPaymentSheet({ intent, publishableKey, amountLabel, choiceQuery, onClose }: CardPaymentSheetProps) {
  const stripe = useMemo(() => stripeFor(publishableKey), [publishableKey]);
  return (
    <Sheet open={intent !== null} onClose={onClose} title={copy.title}>
      {intent ? (
        <div data-card-sheet className="pt-1">
          <p className="text-body text-text-primary">{copy.intro(amountLabel)}</p>
          <Elements stripe={stripe} options={{ clientSecret: intent.clientSecret, appearance: appearance(), loader: "never" }}>
            <CardForm amountLabel={amountLabel} choiceQuery={choiceQuery} />
          </Elements>
        </div>
      ) : null}
    </Sheet>
  );
}

function CardForm({ amountLabel, choiceQuery }: { amountLabel: string; choiceQuery: string }) {
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!stripe || !elements || paying) return;
    setPaying(true);
    setError(null);
    const thankYou = `/donate/thank-you?${choiceQuery}`;
    const result = await stripe.confirmPayment({
      elements,
      // 3-D Secure may leave the page; Stripe brings the donor back here with ?payment_intent=…
      confirmParams: { return_url: new URL(thankYou, window.location.origin).toString() },
      redirect: "if_required",
    });
    if (result.error) {
      setPaying(false);
      setError(result.error.message ?? copy.declined);
      return;
    }
    const status = result.paymentIntent?.status;
    if (status === "succeeded" || status === "processing") {
      router.push(`${thankYou}&payment_intent=${encodeURIComponent(result.paymentIntent!.id)}`);
      return;
    }
    setPaying(false);
    setError(copy.declined);
  }

  return (
    <form
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        void submit();
      }}
      className="mt-3 flex flex-col gap-3"
    >
      <PaymentElement
        options={{
          layout: "tabs",
          fields: { billingDetails: { email: "never", phone: "never", name: "never" } },
          wallets: { applePay: "never", googlePay: "never" },
        }}
        onReady={() => setReady(true)}
        onLoadError={() => setFailed(true)}
      />
      {!ready && !failed ? (
        // Stripe's fields can take a few seconds to arrive on a slow connection.
        <p role="status" data-card-loading className="text-body text-text-muted">
          {copy.loading}
        </p>
      ) : null}
      {failed || error ? (
        <p role="alert" className="text-body text-text-primary">
          {failed ? copy.loadFailed : error}
        </p>
      ) : null}
      {ready && !failed ? (
        <Button variant="primary" onClick={() => void submit()} fullWidth>
          {paying ? copy.paying : copy.pay(amountLabel)}
        </Button>
      ) : null}
    </form>
  );
}
