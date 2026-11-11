import { withCache, type CacheStore } from './cache.js';
import { disabledStatsProvider, type Td2StatsProvider } from './provider.js';
import { createTrackerGgProvider } from './tracker-gg.js';

export type { Td2StatsProvider } from './provider.js';

/** Le service de stats du bot : tracker.gg derrière le cache, ou rien si la clé manque. */
export function createTd2Stats({
  apiKey,
  baseUrl,
  cache,
}: {
  apiKey: string | undefined;
  baseUrl: string;
  cache: CacheStore;
}): Td2StatsProvider {
  if (!apiKey) return disabledStatsProvider;
  return withCache(createTrackerGgProvider({ apiKey, baseUrl }), cache);
}
