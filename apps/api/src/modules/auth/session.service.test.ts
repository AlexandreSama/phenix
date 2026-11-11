import type { Redis } from 'ioredis';
import { describe, expect, it } from 'vitest';
import { SessionService } from './session.service.js';

/** Un Valkey en mémoire, réduit aux commandes utilisées. */
function fakeRedis() {
  const store = new Map<string, string>();
  return {
    store,
    redis: {
      set: async (key: string, value: string) => void store.set(key, value),
      get: async (key: string) => store.get(key) ?? null,
      del: async (key: string) => Number(store.delete(key)),
    } as unknown as Redis,
  };
}

describe('SessionService', () => {
  it('crée, relit et détruit une session', async () => {
    const { redis } = fakeRedis();
    const sessions = new SessionService(redis);

    const id = await sessions.create({ userId: '1', accessToken: 'tok' }, 60);
    expect(id).toMatch(/^[\w-]{43}$/);
    expect(await sessions.get(id)).toEqual({ userId: '1', accessToken: 'tok' });

    await sessions.destroy(id);
    expect(await sessions.get(id)).toBeNull();
  });

  it('ignore un identifiant mal formé sans interroger Valkey', async () => {
    const { redis, store } = fakeRedis();
    store.set('session:*', 'piège');

    expect(await new SessionService(redis).get('*')).toBeNull();
  });
});
