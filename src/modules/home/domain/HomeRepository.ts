import type { HomeContent } from "./types";

/**
 * The native API since Delivery 6 (ADR 020): infrastructure/getHomeRepository.ts.
 */
export interface HomeRepository {
  get(): Promise<HomeContent>;
}
