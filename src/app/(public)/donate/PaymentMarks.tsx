import Image from "next/image";

/**
 * Brand marks for the Donate payment rows (Common pages.pdf p28; the same
 * artwork as figma.pdf p9). Each SVG is a clean, self-contained Figma export
 * — own correct colors, own transparency, own background where the design
 * has one (the three card brands) — shown untouched at its native size. No
 * cropping/recoloring here; if a mark ever looks wrong, the fix is a new
 * export, not logic in this file. Direct debit SEPA uses the bank glyph from
 * the icon set instead (it's a platform icon, not a brand mark).
 */

const ASSET_DIR = "/assets/icons/figma";

interface MarkSpec {
  file: string;
  width: number;
  height: number;
}

const MARKS: Record<PaymentMarkId, MarkSpec | readonly MarkSpec[]> = {
  card: [
    { file: "payment-visa.svg", width: 24, height: 16 },
    { file: "payment-mastercard.svg", width: 24, height: 16 },
    { file: "payment-amex.svg", width: 24, height: 16 },
  ],
  "apple-pay": { file: "apple-pay.svg", width: 38, height: 16 },
  "google-pay": { file: "google-pay.svg", width: 42, height: 16 },
  paypal: { file: "paypal.svg", width: 60, height: 15 },
};

function Mark({ file, width, height }: MarkSpec) {
  return <Image src={`${ASSET_DIR}/${file}`} alt="" width={width} height={height} unoptimized className="shrink-0" />;
}

export type PaymentMarkId = "card" | "apple-pay" | "google-pay" | "paypal";

/** The mark(s) shown at the start of a payment row; decorative (the row carries the name). */
export function PaymentMarks({ method }: { method: PaymentMarkId }) {
  const spec = MARKS[method];
  if (Array.isArray(spec)) {
    // Common pages p28: marks at x=16/44/72 — 4px apart.
    return (
      <span className="flex items-center gap-1">
        {spec.map((mark) => (
          <Mark key={mark.file} {...mark} />
        ))}
      </span>
    );
  }
  return <Mark {...(spec as MarkSpec)} />;
}
