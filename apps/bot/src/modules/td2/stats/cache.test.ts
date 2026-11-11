import { describe, expect, it, vi } from 'vitest';
import {
  CAREER_TTL_SECONDS,
  NOT_FOUND_TTL_SECONDS,
  SEARCH_TTL_SECONDS,
  withCache,
  type CacheStore,
} from './cache.js';
import type { Td2CareerResult, Td2StatsProvider } from './provider.js';

const OK: Td2CareerResult = {
  status: 'ok',
  career: { platform: 'PSN', handle: 'Agent47', avatarUrl: null, profileUrl: null, stats: {} },
};

/** Valkey en mémoire, avec la durée de vie demandée pour chaque clé. */
function memoryStore() {
  const values = new Map<string, string>();
  const ttls = new Map<string, number>();
  const store = {
    get: vi.fn(async (key: string) => values.get(key) ?? null),
    set: vi.fn(async (key: string, value: string, _mode: 'EX', seconds: number) => {
      values.set(key, value);
      ttls.set(key, seconds);
      return 'OK';
    }),
  } satisfies CacheStore;
  return { store, values, ttls };
}

function provider(career: Td2CareerResult = OK, names: string[] = ['Agent47']) {
  return {
    enabled: true,
    credit: 'Powered by Tracker Network',
    career: vi.fn(async () => career),
    search: vi.fn(async () => names),
  } satisfies Td2StatsProvider;
}

describe('withCache', () => {
  it('la seconde demande, même en majuscules, ne rappelle pas le service', async () => {
    const source = provider();
    const { store, ttls } = memoryStore();
    const cached = withCache(source, store);

    expect(await cached.career('PSN', 'Agent47')).toEqual(OK);
    expect(await cached.career('PSN', ' AGENT47 ')).toEqual(OK);

    expect(source.career).toHaveBeenCalledOnce();
    expect(ttls.get('td2:stats:career:PSN:agent47')).toBe(CAREER_TTL_SECONDS);
  });

  it('un joueur introuvable est gardé moins longtemps ; une panne n’est jamais gardée', async () => {
    const { store, ttls } = memoryStore();
    const missing = withCache(provider({ status: 'not-found' }), store);
    const downSource = provider({ status: 'unavailable', reason: 'down' });
    const down = withCache(downSource, store);

    await missing.career('XBL', 'Inconnu');
    await down.career('PSN', 'Agent47');
    await down.career('PSN', 'Agent47');

    expect(ttls.get('td2:stats:career:XBL:inconnu')).toBe(NOT_FOUND_TTL_SECONDS);
    expect(ttls.has('td2:stats:career:PSN:agent47')).toBe(false);
    expect(downSource.career).toHaveBeenCalledTimes(2);
  });

  it('la même plateforme seulement : un pseudo PSN n’est pas un pseudo Xbox', async () => {
    const source = provider();
    const cached = withCache(source, memoryStore().store);

    await cached.career('PSN', 'Agent47');
    await cached.career('XBL', 'Agent47');

    expect(source.career).toHaveBeenCalledTimes(2);
  });

  it('Valkey en panne : le service répond quand même, sans cache', async () => {
    const source = provider();
    const broken: CacheStore = {
      get: async () => {
        throw new Error('Stream isn’t writeable');
      },
      set: async () => {
        throw new Error('Stream isn’t writeable');
      },
    };

    expect(await withCache(source, broken).career('PSN', 'Agent47')).toEqual(OK);
  });

  it('garde les recherches qui trouvent quelque chose, pas les listes vides', async () => {
    const { store, ttls } = memoryStore();
    const found = provider(OK, ['Agent47', 'Agent470']);
    const empty = provider(OK, []);

    await withCache(found, store).search('PSN', 'Agent');
    await withCache(found, store).search('PSN', 'agent');
    await withCache(empty, store).search('PSN', 'zzz');

    expect(found.search).toHaveBeenCalledOnce();
    expect(ttls.get('td2:stats:search:PSN:agent')).toBe(SEARCH_TTL_SECONDS);
    expect(ttls.has('td2:stats:search:PSN:zzz')).toBe(false);
  });
});
