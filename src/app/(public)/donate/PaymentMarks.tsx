import Image from "next/image";
import { ApplePayMark, GooglePayMark, PayPalMark } from "./brandMarks";

/**
 * Brand marks for the Donate payment rows (Common pages.pdf p28; the same
 * artwork as figma.pdf p9). Each SVG is a clean, self-contained Figma export
 * — own correct colors, own transparency, own background where the design
 * has one (the three card brands) — shown untouched at its native size. No
 * cropping/recoloring here; if a mark ever looks wrong, the fix is a new
 * export, not logic in this file. The three single-colour marks (Apple Pay,
 * Google Pay, PayPal) are drawn inline from the same exports with their
 * white set to currentColor (brandMarks.tsx), so they stay visible in the
 * light theme instead of white on white. Direct debit SEPA uses the bank glyph from
 * the icon set instead (it's a platform icon, not a brand mark).
 */

const ASSET_DIR = "/assets/icons/figma";

interface MarkSpec {
  file: string;
  width: number;
  height: number;
}

const CARD_MARKS: readonly MarkSpec[] = [
  { file: "payment-visa.svg", width: 24, height: 16 },
  { file: "payment-mastercard.svg", width: 24, height: 16 },
  { file: "payment-amex.svg", width: 24, height: 16 },
];

function Mark({ file, width, height }: MarkSpec) {
  return <Image src={`${ASSET_DIR}/${file}`} alt="" width={width} height={height} unoptimized className="shrink-0" />;
}

export type PaymentMarkId = "card" | "apple-pay" | "google-pay" | "paypal";

/** The mark(s) shown at the start of a payment row; decorative (the row carries the name). */
export function PaymentMarks({ method }: { method: PaymentMarkId }) {
  switch (method) {
    case "card":
      // Common pages p29: marks at x=16/44/72 — 4px apart.
      return (
        <span className="flex items-center gap-1">
          {CARD_MARKS.map((mark) => (
            <Mark key={mark.file} {...mark} />
          ))}
        </span>
      );
    case "apple-pay":
      return <ApplePayMark />;
    case "google-pay":
      return <GooglePayMark />;
    case "paypal":
      return <PayPalMark />;
  }
}
