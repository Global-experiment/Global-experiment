import Image from "next/image";
import type { ReactNode } from "react";

/**
 * Brand marks for the Donate payment rows (figma.pdf p9). The SVG files are
 * client-supplied and displayed untouched from
 * public/assets/icons/figma/ — nothing is redrawn here.
 *
 * Every supplied file has empty margin around its artwork (an 800×800 box
 * around a 3:1 wordmark, for instance), so each mark is placed by its
 * measured "ink box" — the fraction of the file's box that is actually
 * drawn — and scaled so the artwork itself lands on the Figma dimensions.
 * Marks are decorative: the row's accessible name comes from its text.
 */

const ASSET_DIR = "/assets/icons/figma";

/** Fractions [left, top, right, bottom] of the file's box occupied by artwork. */
type InkBox = readonly [number, number, number, number];

interface MarkProps {
  file: string;
  /** Rendered size of the artwork itself, in CSS px. */
  width: number;
  height: number;
  ink?: InkBox;
  /** Render a dark-on-transparent mark as white (the design shows Apple Pay and PayPal white on black). */
  white?: boolean;
}

function Mark({ file, width, height, ink = [0, 0, 1, 1], white = false }: MarkProps) {
  const [l, t, r, b] = ink;
  const boxWidth = width / (r - l);
  const boxHeight = height / (b - t);
  return (
    <span className="relative block shrink-0 overflow-hidden" style={{ width, height }}>
      <Image
        src={`${ASSET_DIR}/${file}`}
        alt=""
        width={Math.round(boxWidth)}
        height={Math.round(boxHeight)}
        unoptimized
        className={white ? "brightness-0 invert" : undefined}
        style={{
          position: "absolute",
          maxWidth: "none",
          width: boxWidth,
          height: boxHeight,
          left: -l * boxWidth,
          top: -t * boxHeight,
        }}
      />
    </span>
  );
}

/** The 24×16 tile the design uses for card brands. */
function Chip({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span className={`flex h-4 w-6 shrink-0 items-center justify-center overflow-hidden rounded-[3px] ${className}`}>
      {children}
    </span>
  );
}

export type PaymentMethodId = "card" | "apple-pay" | "google-pay" | "paypal";

/** The mark(s) shown at the start of each payment row. */
export function PaymentMarks({ method }: { method: PaymentMethodId }) {
  switch (method) {
    case "card":
      return (
        <span className="flex items-center gap-1">
          {/* Supplied Visa is a black glyph, so it sits on a white tile. */}
          <Chip className="bg-white">
            <Mark file="payment-visa.svg" width={17} height={5.5} ink={[0.031, 0.349, 0.969, 0.651]} />
          </Chip>
          {/* Supplied Mastercard is its own black card. */}
          <Chip>
            <Mark file="payment-mastercard.svg" width={24} height={15.1} ink={[0, 0.185, 1, 0.815]} />
          </Chip>
          {/* Supplied Amex tile is square; the 24×16 tile crops it top and bottom like the design. */}
          <Chip>
            <Mark file="payment-amex.svg" width={24} height={24} />
          </Chip>
        </span>
      );
    case "apple-pay":
      return <Mark file="apple-pay.svg" width={38} height={16} ink={[0.115, 0.262, 0.885, 0.738]} white />;
    case "google-pay":
      // The supplied file includes its own white card; shown as supplied.
      return <Mark file="google-pay.svg" width={35} height={24} ink={[0, 0.156, 1, 0.844]} />;
    case "paypal":
      return <Mark file="paypal.svg" width={59} height={15} ink={[0.04, 0.384, 0.949, 0.615]} white />;
  }
}
