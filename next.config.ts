import type { NextConfig } from "next";
import { adminApiOrigin } from "./src/shared/config/adminApi";
import { getSecurityHeaders } from "./src/shared/security/headers";

const nextConfig: NextConfig = {
  // Dev-only "N" route indicator (bottom-left, visible only under `next
  // dev`, never in production) — hidden for cleaner screenshots/review.
  // Next.js still surfaces compile/runtime errors regardless.
  devIndicators: false,
  async rewrites() {
    const origin = adminApiOrigin();
    // Same-origin proxy for the native admin API (see src/shared/config/adminApi.ts).
    // beforeFiles: nothing in the Next.js app may shadow /api/admin/*.
    return {
      beforeFiles: origin ? [{ source: "/api/admin/:path*", destination: `${origin}/api/admin/:path*` }] : [],
      afterFiles: [],
      fallback: [],
    };
  },
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
