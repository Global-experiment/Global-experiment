import type { HomeContent } from "./types";

/**
 * v0.1 implementation: NotionHomeRepository (live Notion page). v1 will
 * replace it with a self-hosted source behind this same interface — see
 * docs/architecture/decisions/003-notion-temporary-adapter.md.
 */
export interface HomeRepository {
  get(): Promise<HomeContent>;
}
