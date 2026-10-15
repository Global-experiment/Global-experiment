import type { NextConfig } from "next";
import { adminApiOrigin } from "./src/shared/config/adminApi";
import { PUBLIC_API_PREFIXES } from "./src/shared/config/publicApi";
import { getSecurityHeaders } from "./src/shared/security/headers";

const nextConfig: NextConfig = {
  // Dev-only "N" route indicator (bottom-left, visible only under `next
  // dev`, never in production) — hidden for cleaner screenshots/review.
  // Next.js still surfaces compile/runtime errors regardless.
  devIndicators: false,
  experimental: {
    // The API proxy (rewrites below) buffers request bodies up to this size
    // and cuts the rest (default 10 MB): Treasury documents go up to 20 MB
    // plus the multipart envelope. nginx keeps every other route at 1 MB and
    // allows 21 MB on the upload route only.
    proxyClientMaxBodySize: "21mb",
  },
  async rewrites() {
    const origin = adminApiOrigin();
    // Same-origin proxy for the native API (see src/shared/config/adminApi.ts):
    // the admin routes, and the public donation routes — Checkout, Stripe's
    // webhook (the raw body passes through untouched, as its signature needs)
    // and the Treasury figures. beforeFiles: nothing in the Next.js app may
    // shadow them. /api/revalidate is the Next.js app's own route.
    const prefixes = ["admin", ...PUBLIC_API_PREFIXES];
    return {
      beforeFiles: origin ? prefixes.map((prefix) => ({ source: `/api/${prefix}/:path*`, destination: `${origin}/api/${prefix}/:path*` })) : [],
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
