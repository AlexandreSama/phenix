import type { Td2PlatformKey } from '@phenix/shared';
import type { Td2CareerResult, Td2StatsProvider } from './provider.js';

/** Ce que le cache utilise de Valkey : lire, et écrire avec une durée de vie. */
export interface CacheStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: 'EX', seconds: number): Promise<unknown>;
}

/** Les stats bougent peu d'une partie à l'autre : un quart d'heure suffit. */
export const CAREER_TTL_SECONDS = 15 * 60;
/** Un joueur introuvable peut créer son compte : on redemande plus tôt. */
export const NOT_FOUND_TTL_SECONDS = 5 * 60;
export const SEARCH_TTL_SECONDS = 10 * 60;

const key = (kind: 'career' | 'search', platform: Td2PlatformKey, name: string) =>
  `td2:stats:${kind}:${platform}:${name.trim().toLowerCase()}`;

/**
 * Garde les réponses du service dans Valkey, pour rester sous sa limite de débit avec un bot
 * public. Une panne n'est jamais gardée : la demande suivante retente. Si Valkey ne répond pas,
 * le bot interroge le service directement, sans cache.
 */
export function withCache(provider: Td2StatsProvider, store: CacheStore): Td2StatsProvider {
  const read = async <T>(cacheKey: string): Promise<T | null> => {
    try {
      const cached = await store.get(cacheKey);
      return cached === null ? null : (JSON.parse(cached) as T);
    } catch {
      return null;
    }
  };
  const write = async (cacheKey: string, value: unknown, seconds: number) => {
    await store.set(cacheKey, JSON.stringify(value), 'EX', seconds).catch(() => undefined);
  };

  return {
    enabled: provider.enabled,
    credit: provider.credit,

    async career(platform, playerName) {
      const cacheKey = key('career', platform, playerName);
      const cached = await read<Td2CareerResult>(cacheKey);
      if (cached) return cached;

      const result = await provider.career(platform, playerName);
      if (result.status === 'ok') await write(cacheKey, result, CAREER_TTL_SECONDS);
      if (result.status === 'not-found') await write(cacheKey, result, NOT_FOUND_TTL_SECONDS);
      return result;
    },

    async search(platform, query) {
      const cacheKey = key('search', platform, query);
      const cached = await read<string[]>(cacheKey);
      if (cached) return cached;

      const names = await provider.search(platform, query);
      // Une liste vide peut venir d'une panne : on ne la garde pas
      if (names.length > 0) await write(cacheKey, names, SEARCH_TTL_SECONDS);
      return names;
    },
  };
}
