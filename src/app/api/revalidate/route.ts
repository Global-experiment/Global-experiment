import { createHash, timingSafeEqual } from "node:crypto";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { PUBLIC_CACHE_TAGS } from "@/shared/config/publicApi";

/**
 * POST /api/revalidate — the native API's on-demand revalidation hook
 * (docs/architecture/overview.md §3.7). After a ledger write the API posts
 * the stale tags with the shared REVALIDATE_SECRET; only known tags are
 * accepted. `{ expire: 0 }`: the next visitor gets fresh figures, never a
 * stale copy (a donor checking the treasury right after donating).
 */
const RevalidateRequest = z.strictObject({
  tags: z.array(z.enum(Object.values(PUBLIC_CACHE_TAGS) as [string, ...string[]])).min(1).max(10),
});

// Hashing first makes the comparison constant-time regardless of length.
const digest = (value: string) => createHash("sha256").update(value).digest();

function authorized(header: string | null): boolean {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret || secret.length < 32 || !header) return false;
  return timingSafeEqual(digest(header), digest(secret));
}

export async function POST(request: Request) {
  if (!authorized(request.headers.get("x-revalidate-secret"))) {
    return Response.json({ error: "unauthorized" }, { status: 401, headers: { "cache-control": "no-store" } });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const parsed = RevalidateRequest.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "invalid_request" }, { status: 400, headers: { "cache-control": "no-store" } });
  }
  const tags = [...new Set(parsed.data.tags)];
  for (const tag of tags) revalidateTag(tag, { expire: 0 });
  return Response.json({ revalidated: tags }, { headers: { "cache-control": "no-store" } });
}
