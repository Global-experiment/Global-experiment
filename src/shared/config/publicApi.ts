import { adminApiOrigin } from "./adminApi";
import type { DonationCurrency } from "@/shared/donate/money";
import type { DonationFrequency } from "@/shared/donate/donateParams";

/**
 * The native API's public routes, as the Next.js server reads them (server
 * components only — never imported by client code). The browser reaches the
 * same routes same-origin through the rewrites in next.config.ts.
 *
 * Caching (docs/architecture/overview.md §3.7): Treasury figures are cached
 * under the `treasury` tag and revalidated on demand — the API calls
 * /api/revalidate after every ledger write — with a 5-minute time-based
 * fallback. The donation configuration (flags from settings) and Checkout
 * session checks are never cached.
 */
export const PUBLIC_API_PREFIXES = ["donations", "stripe", "treasury"] as const;

/** Tags the API may revalidate (apps/api/src/revalidation/revalidation.service.ts). */
export const PUBLIC_CACHE_TAGS = { treasury: "treasury" } as const;
export const TREASURY_REVALIDATE_SECONDS = 300;

/** Same API process as the admin routes (single API instance in v0.1). */
export const publicApiOrigin = adminApiOrigin;

export interface DonationConfig {
  available: boolean;
  /** False until donations open (donations.enabled); true earlier only with a valid preview token. */
  enabled: boolean;
  currencies: DonationCurrency[];
  defaultCurrency: DonationCurrency;
  presets: number[];
  minimum: number;
  maximum: number;
  monthly: boolean;
  methods: { key: DonationMethodKey; currencies: DonationCurrency[]; frequencies: DonationFrequency[] }[];
  customerPortalUrl: string | null;
}

export type DonationMethodKey = "card" | "apple_pay" | "google_pay" | "paypal" | "sepa_debit";

export interface DonationSummary {
  currency: DonationCurrency;
  totalDonated: number;
  donationCount: number;
  medianDonation: number | null;
  monthlyDonors: number;
  lastEntryAt: string | null;
}

export interface CheckoutStatus {
  status: string | null;
  paymentStatus: string;
  frequency: DonationFrequency;
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number | null };

async function getJson<T>(path: string, init: RequestInit & { next?: { revalidate?: number; tags?: string[] } }): Promise<ApiResult<T>> {
  const origin = publicApiOrigin();
  if (!origin) return { ok: false, status: null };
  try {
    const response = await fetch(`${origin}${path}`, { ...init, headers: { accept: "application/json", ...init.headers }, signal: AbortSignal.timeout(5000) });
    if (!response.ok) return { ok: false, status: response.status };
    return { ok: true, data: (await response.json()) as T };
  } catch {
    // API down or unreachable: callers render their "unavailable" state.
    return { ok: false, status: null };
  }
}

/** `previewToken`: the private preview link's token, checked by the API (never logged). */
export function fetchDonationConfig(previewToken?: string): Promise<ApiResult<DonationConfig>> {
  return getJson("/api/donations/config", { cache: "no-store", headers: previewToken ? { "x-donations-preview": previewToken } : undefined });
}

export function fetchDonationSummary(currency: DonationCurrency): Promise<ApiResult<DonationSummary>> {
  return getJson(`/api/treasury/summary?currency=${currency}`, {
    next: { revalidate: TREASURY_REVALIDATE_SECONDS, tags: [PUBLIC_CACHE_TAGS.treasury] },
  });
}

export function fetchCheckoutStatus(sessionId: string): Promise<ApiResult<CheckoutStatus>> {
  return getJson(`/api/donations/checkout/${encodeURIComponent(sessionId)}`, { cache: "no-store" });
}
