import type { NextConfig } from "next";
import { getSecurityHeaders } from "./src/shared/security/headers";

const nextConfig: NextConfig = {
  // Dev-only "N" route indicator (bottom-left, visible only under `next
  // dev`, never in production) — hidden for cleaner screenshots/review.
  // Next.js still surfaces compile/runtime errors regardless.
  devIndicators: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: getSecurityHeaders(),
      },
    ];
  },
};

export default nextConfig;
