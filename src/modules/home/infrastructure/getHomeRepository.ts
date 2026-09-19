import type { HomeRepository } from "@/modules/home/domain/HomeRepository";
import { NotionHomeRepository } from "./NotionHomeRepository";

let cached: HomeRepository | undefined;

/**
 * Single composition point for the Home source: always live Notion, in
 * every environment. No static, fixture or fallback copy exists in the
 * running application (see ADR 009).
 */
export function getHomeRepository(): HomeRepository {
  cached ??= new NotionHomeRepository();
  return cached;
}
