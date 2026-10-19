import { describe, expect, it } from "vitest";
import { getSecurityHeaders } from "./headers";

const csp = (options?: { stripe?: boolean }) => getSecurityHeaders(options).find((header) => header.key === "Content-Security-Policy")!.value;

describe("Content-Security-Policy", () => {
  it("is strict by default: no third-party script, frame or connection", () => {
    const policy = csp();
    expect(policy).not.toMatch(/stripe/);
    expect(policy).not.toMatch(/frame-src/);
    expect(policy).toContain("connect-src 'self';");
    expect(policy).toContain("frame-ancestors 'none'");
  });

  it("allows Stripe.js and its card iframe on the donate pages only (embedded card form, 2026-10-19)", () => {
    const policy = csp({ stripe: true });
    expect(policy).toMatch(/script-src [^;]*https:\/\/js\.stripe\.com/);
    expect(policy).toMatch(/frame-src https:\/\/js\.stripe\.com [^;]*https:\/\/hooks\.stripe\.com/);
    expect(policy).toMatch(/connect-src 'self' https:\/\/api\.stripe\.com/);
    // Embedding our pages elsewhere stays forbidden.
    expect(policy).toContain("frame-ancestors 'none'");
  });
});
