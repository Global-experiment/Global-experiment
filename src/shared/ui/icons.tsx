/**
 * Minimal inline line icons used on Home's action grid.
 *
 * These are semantic placeholders, not pixel-accurate reproductions of the
 * Figma source glyphs — exact icon artwork isn't recoverable from the PDF
 * export used for the design audit and needs real Figma asset access to
 * match precisely. Swappable without touching call sites.
 */

const shared = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export function WaitlistIcon() {
  return (
    <svg {...shared}>
      <path d="M4 4h16v12H9l-5 4V4z" />
    </svg>
  );
}

export function ContributeIcon() {
  return (
    <svg {...shared}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" />
    </svg>
  );
}

export function DonateIcon() {
  return (
    <svg {...shared}>
      <path d="M12 21s-7-4.35-9.5-8.5C1 9 2.5 5.5 6 5c2-.3 4 1 6 3 2-2 4-3.3 6-3 3.5.5 5 4 3.5 7.5C19 16.65 12 21 12 21z" />
    </svg>
  );
}

export function TreasuryIcon() {
  return (
    <svg {...shared}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </svg>
  );
}
