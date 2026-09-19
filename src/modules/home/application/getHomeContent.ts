import { getHomeRepository } from "@/modules/home/infrastructure/getHomeRepository";
import type { HomeContent } from "@/modules/home/domain/types";

export function getHomeContent(): Promise<HomeContent> {
  return getHomeRepository().get();
}
