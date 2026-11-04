import type { HomeRepository } from "@/modules/home/domain/HomeRepository";
import type { HomeContent } from "@/modules/home/domain/types";
import { fetchCmsHome } from "@/shared/config/publicApi";
import { ProviderError } from "@/shared/errors/app-error";
import { mapHomeBlocks } from "./homeMapper";

/**
 * Home from the native API (ADR 020): the published revision, cached under
 * the `home` tag and revalidated on every publication. No static or
 * fallback copy exists in the running application (ADR 009): when the API
 * can't answer, the page fails with an error status instead.
 */
class ApiHomeRepository implements HomeRepository {
  async get(): Promise<HomeContent> {
    const result = await fetchCmsHome();
    if (!result.ok) throw new ProviderError(result.status === 404 ? "Home has no published content yet." : "The Home content couldn't be loaded.");
    return mapHomeBlocks(result.data.content);
  }
}

let cached: HomeRepository | undefined;

export function getHomeRepository(): HomeRepository {
  cached ??= new ApiHomeRepository();
  return cached;
}
