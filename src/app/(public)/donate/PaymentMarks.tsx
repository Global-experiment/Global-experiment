import Image from "next/image";

/**
 * Brand marks for the Donate payment rows (figma.pdf p9). Each SVG is a
 * clean, self-contained Figma export — own correct colors, own transparency,
 * own background where the design has one (the three card brands) — shown
 * untouched at its native size. No cropping/recoloring here; if a mark ever
 * looks wrong, the fix is a new export, not logic in this file.
 */

const ASSET_DIR = "/assets/icons/figma";

interface MarkSpec {
  file: string;
  width: number;
  height: number;
}

const MARKS: Record<PaymentMethodId, MarkSpec | readonly MarkSpec[]> = {
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
  return (
    <Image
      src={`${ASSET_DIR}/${file}`}
      alt=""
      width={width}
      height={height}
      unoptimized
      className="shrink-0"
    />
  );
}

export type PaymentMethodId = "card" | "apple-pay" | "google-pay" | "paypal";

/** The mark(s) shown at the start of each payment row. */
export function PaymentMarks({ method }: { method: PaymentMethodId }) {
  const spec = MARKS[method];
  if (Array.isArray(spec)) {
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
