import { DiscordAPIError } from '@discordjs/rest';
import { Logger } from '@nestjs/common';
import { createLock, LockBusyError, moderationLockKey } from '@phenix/jobs';
import { BOT_EVENTS_CHANNEL, parseBotEvent, type ResolvedUser } from '@phenix/shared';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it, vi } from 'vitest';
import { UserDirectory } from '../modules/moderation/user-directory.js';
import { BotEventsService } from './bot-events.service.js';
import { CacheService } from './cache.service.js';
import { LockService } from './lock.service.js';

// Vrai Valkey (Testcontainers), vrai ioredis : seul Discord est simulé.
const url = inject('redisUrl');
const redis = new Redis(url);
const cache = new CacheService(redis);

beforeAll(() => {
  // Les avertissements du code testé (échecs Discord) n'ont pas à polluer la sortie
  vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
});

beforeEach(async () => {
  await redis.flushall();
});

afterAll(async () => {
  await redis.quit();
});

/** Le nombre d'appels que Valkey a reçus pour une commande (INFO commandstats). */
async function calls(command: string): Promise<number> {
  const stats = await redis.info('commandstats');
  const line = stats.split('\n').find((entry) => entry.startsWith(`cmdstat_${command}:`));
  return Number(/calls=(\d+)/.exec(line ?? '')?.[1] ?? 0);
}

describe('CacheService sur un vrai Valkey', () => {
  it('put garde la valeur en JSON avec un TTL (EX) réellement posé', async () => {
    await cache.put('cache:test:ttl', { a: 1 }, 120);

    expect(JSON.parse((await redis.get('cache:test:ttl')) ?? 'null')).toEqual({ a: 1 });
    const ttl = await redis.ttl('cache:test:ttl');
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(120);
  });

  it('getMany relit les valeurs dans l’ordre, null pour une clé absente', async () => {
    await cache.put('cache:test:a', { n: 1 }, 60);
    await cache.put('cache:test:c', 'texte', 60);

    expect(await cache.getMany(['cache:test:a', 'cache:test:absente', 'cache:test:c'])).toEqual([
      { n: 1 },
      null,
      'texte',
    ]);
  });

  it('getMany renvoie null pour une valeur illisible, sans toucher aux autres', async () => {
    await redis.set('cache:test:cassee', '{pas du json');
    await cache.put('cache:test:ok', { ok: true }, 60);

    expect(await cache.getMany(['cache:test:cassee', 'cache:test:ok'])).toEqual([
      null,
      { ok: true },
    ]);
  });

  it('getMany fait un seul aller-retour (MGET), quel que soit le nombre de clés', async () => {
    await cache.put('cache:test:1', 1, 60);
    await redis.config('RESETSTAT');

    await cache.getMany(['cache:test:1', 'cache:test:2', 'cache:test:3']);

    expect(await calls('mget')).toBe(1);
    expect(await calls('get')).toBe(0);
  });

  it('getMany d’une liste vide renvoie [] sans interroger Valkey', async () => {
    await redis.config('RESETSTAT');

    expect(await cache.getMany([])).toEqual([]);

    expect(await calls('mget')).toBe(0);
  });
});

const idOf = (n: number) => `5000000000000000${String(n).padStart(2, '0')}`;
const profileKey = (id: string) => `discord:users:${id}`;

describe('UserDirectory sur un vrai Valkey (Discord simulé)', () => {
  const getUser = vi.fn();
  const directory = () => new UserDirectory(cache, { getUser });

  beforeEach(() => {
    getUser.mockReset();
    getUser.mockImplementation(async (id: string) => ({
      username: `user${id.slice(-2)}`,
      global_name: 'Alpha',
      avatar: null,
    }));
  });

  it('un profil résolu est relu depuis Valkey, avec un TTL d’au plus 300 s', async () => {
    const id = idOf(1);

    const first = await directory().resolve([id]);

    expect(first.get(id)).toMatchObject({ id, name: 'Alpha' });
    const stored = JSON.parse((await redis.get(profileKey(id))) ?? 'null') as ResolvedUser;
    expect(stored).toEqual(first.get(id));
    const ttl = await redis.ttl(profileKey(id));
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(300);

    // Un second appel (autre instance) est servi par Valkey, Discord n'est pas réinterrogé
    const second = await directory().resolve([id]);
    expect(second.get(id)).toEqual(first.get(id));
    expect(getUser).toHaveBeenCalledTimes(1);
  });

  it('un échec est gardé 60 s au plus, avec l’identifiant à la place du nom', async () => {
    const id = idOf(2);
    getUser.mockRejectedValue(new Error('Discord injoignable'));

    const users = await directory().resolve([id]);

    expect(users.get(id)).toEqual({ id, name: id, avatarUrl: null });
    expect(JSON.parse((await redis.get(profileKey(id))) ?? 'null')).toEqual({
      id,
      name: id,
      avatarUrl: null,
    });
    const ttl = await redis.ttl(profileKey(id));
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(60);

    await directory().resolve([id]);
    expect(getUser).toHaveBeenCalledTimes(1);
  });

  it('un refus de Discord (403) est gardé comme un échec', async () => {
    const id = idOf(3);
    getUser.mockRejectedValue(
      new DiscordAPIError(
        { code: 50001, message: 'Missing Access' },
        50001,
        403,
        'GET',
        `/users/${id}`,
        {
          body: undefined,
          files: undefined,
        },
      ),
    );

    await directory().resolve([id]);

    const ttl = await redis.ttl(profileKey(id));
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(60);
  });

  it('au plus 10 profils absents du cache par appel ; le reste attend le suivant', async () => {
    const ids = Array.from({ length: 15 }, (_, index) => idOf(index + 10));

    const first = await directory().resolve(ids);

    expect(getUser).toHaveBeenCalledTimes(10);
    expect(await redis.keys('discord:users:*')).toHaveLength(10);
    // Les 5 derniers s'affichent avec leur identifiant et ne sont pas gardés
    for (const id of ids.slice(10)) {
      expect(first.get(id)).toEqual({ id, name: id, avatarUrl: null });
      expect(await redis.exists(profileKey(id))).toBe(0);
    }

    // Le rafraîchissement suivant complète les 5 manquants, les 10 premiers viennent de Valkey
    await directory().resolve(ids);
    expect(getUser).toHaveBeenCalledTimes(15);
    expect(await redis.keys('discord:users:*')).toHaveLength(15);
  });
});

describe('BotEventsService sur un vrai Valkey', () => {
  it('publie moderation.logged sur bot:events : un abonné le reçoit, avec seulement des identifiants', async () => {
    const subscriber = new Redis(url);
    try {
      const received = new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Aucun message reçu')), 10_000);
        subscriber.on('message', (channel: string, message: string) => {
          if (channel !== BOT_EVENTS_CHANNEL) return;
          clearTimeout(timer);
          resolve(message);
        });
      });
      await subscriber.subscribe(BOT_EVENTS_CHANNEL);

      await new BotEventsService(redis).notify({
        type: 'moderation.logged',
        guildId: '42',
        caseId: 7,
      });

      const raw = await received;
      expect(parseBotEvent(raw)).toEqual({ type: 'moderation.logged', guildId: '42', caseId: 7 });
      expect(Object.keys(JSON.parse(raw) as object).toSorted()).toEqual([
        'caseId',
        'guildId',
        'type',
      ]);
    } finally {
      await subscriber.quit();
    }
  });
});

describe('LockService sur un vrai Valkey (verrou partagé avec le bot)', () => {
  const key = moderationLockKey('300000000000000001', '500000000000000001');

  it('un verrou posé par le bot avec moderationLockKey bloque l’API, puis la laisse passer une fois libéré', async () => {
    // Le bot pose le même verrou avec son propre client ioredis
    const botRedis = new Redis(url);
    const bot = createLock(botRedis, { ttlMs: 30_000, waitMs: 0, retryMs: 50, timeoutMs: 1_000 });
    const api = new LockService(redis);
    const task = vi.fn(async () => 'levée');

    try {
      await bot.withLock(key, async () => {
        await expect(api.withLock(key, task)).rejects.toBeInstanceOf(LockBusyError);
      });
    } finally {
      await botRedis.quit();
    }

    expect(task).not.toHaveBeenCalled();
    await expect(api.withLock(key, task)).resolves.toBe('levée');
    expect(await redis.exists(key)).toBe(0);
  });

  it('pose la clé avec un TTL d’au plus 30 s pendant la tâche', async () => {
    await new LockService(redis).withLock(key, async () => {
      const ttl = await redis.pttl(key);
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(30_000);
    });
  });
});
