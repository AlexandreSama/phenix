import { createHash } from 'node:crypto';
import { DiscordAPIError, HTTPError } from '@discordjs/rest';
import { Logger } from '@nestjs/common';
import type { PrismaClient } from '@phenix/database';
import type { Redis } from 'ioredis';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CacheService } from '../../core/cache.service.js';
import { RateLimitService } from '../../core/rate-limit.service.js';
import { MemberSearch } from './member-search.js';

const GUILD = '300000000000000001';
const ACTOR = '100000000000000001';
const A = '500000000000000001';
const B = '500000000000000002';
const C = '500000000000000003';
const D = '500000000000000004';
const E = '500000000000000005';
const FOUND = '700000000000000001';

const store = new Map<string, string>();
const redis = {
  get: vi.fn(async (key: string) => store.get(key) ?? null),
  mget: vi.fn(async (...keys: string[]) => keys.map((key) => store.get(key) ?? null)),
  set: vi.fn(async (key: string, value: string, _mode?: string, _seconds?: number) => {
    store.set(key, value);
    return 'OK';
  }),
  incr: vi.fn(async (key: string) => {
    const count = Number(store.get(key) ?? 0) + 1;
    store.set(key, String(count));
    return count;
  }),
  expire: vi.fn(async () => 1),
};
/** Les cibles des sanctions de GUILD (distinctCasePeople) ; E n'en a aucune ici. */
const db = {
  case: {
    groupBy: vi.fn(async (_args?: object) => [A, B, C, D].map((targetId) => ({ targetId }))),
  },
};
/** Par défaut, Discord trouve FOUND. */
const findFound = async (
  _guildId: string,
  _query: string,
  _limit?: number,
  _signal?: AbortSignal,
) => [{ user: { id: FOUND } }] as { user?: { id: string } }[];
const discord = { searchGuildMembers: vi.fn(findFound) };
const search = new MemberSearch(
  db as unknown as PrismaClient,
  new CacheService(redis as unknown as Redis),
  new RateLimitService(redis as unknown as Redis),
  discord,
);

const searchKey = (text: string) =>
  `discord:member-search:${GUILD}:${createHash('sha256').update(text).digest('hex')}`;
const profile = (id: string, name: string) =>
  store.set(`discord:users:${id}`, JSON.stringify({ id, name, avatarUrl: null }));
const discordError = (status: number) =>
  new DiscordAPIError(
    { code: 0, message: 'x' },
    0,
    status,
    'GET',
    `/guilds/${GUILD}/members/search`,
    {
      body: undefined,
      files: undefined,
    },
  );

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  store.clear();
  vi.clearAllMocks();
  // clearAllMocks garde l'implémentation posée par un test (mockResolvedValue…) : mockReset l'efface
  discord.searchGuildMembers.mockReset().mockImplementation(findFound);
  warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe('MemberSearch : quand chercher', () => {
  it.each([
    ['absent', undefined],
    ['vide', ''],
    ['des espaces', '   '],
    ['un seul caractère après trim', ' F '],
    ['un numéro', '12'],
    ['un numéro avec #', '#12'],
    ['un identifiant Discord', A],
  ])('%s → not-applicable, sans Discord ni Valkey ni base', async (_nom, q) => {
    expect(await search.search(GUILD, ACTOR, q)).toEqual({
      userIds: [],
      nameSearch: 'not-applicable',
    });
    expect(discord.searchGuildMembers).not.toHaveBeenCalled();
    expect(db.case.groupBy).not.toHaveBeenCalled();
    expect(redis.mget).not.toHaveBeenCalled();
    expect(redis.incr).not.toHaveBeenCalled();
  });

  it('plus de 32 caractères après trim (aucun pseudo ne peut correspondre) → not-applicable, rien ne part', async () => {
    const q = `  ${'a'.repeat(33)}  `;

    expect(await search.search(GUILD, ACTOR, q)).toEqual({
      userIds: [],
      nameSearch: 'not-applicable',
    });
    expect(discord.searchGuildMembers).not.toHaveBeenCalled();
    expect(db.case.groupBy).not.toHaveBeenCalled();
    expect(redis.mget).not.toHaveBeenCalled();
    expect(redis.incr).not.toHaveBeenCalled();
  });

  it('32 caractères (la longueur maximale d’un pseudo) → Discord est interrogé', async () => {
    const q = 'a'.repeat(32);

    expect((await search.search(GUILD, ACTOR, q)).nameSearch).toBe('used');
    expect(discord.searchGuildMembers).toHaveBeenCalledWith(GUILD, q, 25, expect.any(AbortSignal));
  });
});

describe('MemberSearch : Discord', () => {
  it('cherche le texte (sans espaces autour) sur CE serveur, 25 au plus, avec une échéance', async () => {
    const result = await search.search(GUILD, ACTOR, '  Fa  ');

    expect(result).toEqual({ userIds: [FOUND], nameSearch: 'used' });
    expect(discord.searchGuildMembers).toHaveBeenCalledWith(
      GUILD,
      'Fa',
      25,
      expect.any(AbortSignal),
    );
  });

  it('garde 60 s les identifiants seulement, sous une clé qui ne contient pas le texte en clair', async () => {
    await search.search(GUILD, ACTOR, 'Faye');

    expect(redis.set).toHaveBeenCalledWith(searchKey('faye'), JSON.stringify([FOUND]), 'EX', 60);
    const keys = redis.set.mock.calls.map(([key]) => key).join(' ');
    expect(keys.toLowerCase()).not.toContain('faye');
  });

  it('la même recherche dans les 60 s, casse ignorée, ne rappelle pas Discord', async () => {
    await search.search(GUILD, ACTOR, 'faye');

    const again = await search.search(GUILD, ACTOR, 'FAYE');

    expect(again).toEqual({ userIds: [FOUND], nameSearch: 'used' });
    expect(discord.searchGuildMembers).toHaveBeenCalledTimes(1);
  });

  it('Discord muet au-delà de l’échéance → unavailable, rien n’est gardé en cache', async () => {
    discord.searchGuildMembers.mockImplementationOnce(() => new Promise(() => undefined));

    const result = await search.search(GUILD, ACTOR, 'Fa', { deadlineMs: 20 });

    expect(result).toEqual({ userIds: [], nameSearch: 'unavailable' });
    expect(store.has(searchKey('fa'))).toBe(false);
  });

  it.each([401, 403, 429, 500])(
    'un refus de Discord (%i) → unavailable, journalisé avec le statut seul',
    async (status) => {
      discord.searchGuildMembers.mockRejectedValueOnce(discordError(status));

      const result = await search.search(GUILD, ACTOR, 'Faye');

      expect(result).toEqual({ userIds: [], nameSearch: 'unavailable' });
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0]?.[0]).toEqual({ status });
      const logged = JSON.stringify(warn.mock.calls);
      expect(logged.toLowerCase()).not.toContain('faye');
      expect(logged).not.toContain(GUILD);
    },
  );

  it.each([
    [
      'muet au-delà de l’échéance',
      () => new Promise<never>(() => undefined),
      { status: 'timeout' },
    ],
    [
      'une erreur réseau',
      () => Promise.reject(new Error(`ECONNRESET ${GUILD}`)),
      { status: 'network' },
    ],
    [
      'une erreur HTTP',
      () =>
        Promise.reject(
          new HTTPError(502, 'Bad Gateway', 'GET', `/guilds/${GUILD}/members/search?query=faye`, {
            body: undefined,
            files: undefined,
          }),
        ),
      { status: 502 },
    ],
  ])('Discord %s → journalisé avec le statut seul', async (_nom, failure, expected) => {
    discord.searchGuildMembers.mockImplementationOnce(failure);

    const result = await search.search(GUILD, ACTOR, 'Faye', { deadlineMs: 20 });

    expect(result).toEqual({ userIds: [], nameSearch: 'unavailable' });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toEqual(expected);
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged.toLowerCase()).not.toContain('faye');
    expect(logged).not.toContain(GUILD);
    expect(logged).not.toContain(ACTOR);
  });

  it('l’écriture du cache échoue après la réponse de Discord → le résultat sert quand même (used), journal générique', async () => {
    redis.set.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    expect(await search.search(GUILD, ACTOR, 'Faye')).toEqual({
      userIds: [FOUND],
      nameSearch: 'used',
    });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('Member search result not cached');
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged.toLowerCase()).not.toContain('faye');
    expect(logged).not.toContain(GUILD);
    expect(logged).not.toContain(ACTOR);
    expect(logged).not.toContain(FOUND);
  });

  it('un membre sans `user` dans la réponse de Discord est ignoré', async () => {
    discord.searchGuildMembers.mockResolvedValueOnce([{}, { user: { id: FOUND } }]);

    expect(await search.search(GUILD, ACTOR, 'Fa')).toEqual({
      userIds: [FOUND],
      nameSearch: 'used',
    });
  });

  it('la 20e recherche du compte dans la minute passe, la 21e est unavailable sans Discord', async () => {
    store.set(`ratelimit:member-search:${ACTOR}`, '19');

    expect((await search.search(GUILD, ACTOR, 'Fa')).nameSearch).toBe('used');
    expect((await search.search(GUILD, ACTOR, 'Fb')).nameSearch).toBe('unavailable');
    expect(discord.searchGuildMembers).toHaveBeenCalledTimes(1);
  });

  it('la 60e recherche du serveur dans la minute passe, la 61e est unavailable sans Discord', async () => {
    store.set(`ratelimit:member-search:guild:${GUILD}`, '59');

    expect((await search.search(GUILD, ACTOR, 'Fa')).nameSearch).toBe('used');
    expect((await search.search(GUILD, ACTOR, 'Fb')).nameSearch).toBe('unavailable');
    expect(discord.searchGuildMembers).toHaveBeenCalledTimes(1);
  });

  it('une recherche servie par le cache de 60 s ne consomme pas le quota', async () => {
    await search.search(GUILD, ACTOR, 'Faye');
    await search.search(GUILD, ACTOR, 'Faye');

    expect(store.get(`ratelimit:member-search:${ACTOR}`)).toBe('1');
    expect(store.get(`ratelimit:member-search:guild:${GUILD}`)).toBe('1');
  });

  it('au-delà de 20 recherches par minute pour ce compte → unavailable, sans Discord', async () => {
    store.set(`ratelimit:member-search:${ACTOR}`, '20');

    expect(await search.search(GUILD, ACTOR, 'Fa')).toEqual({
      userIds: [],
      nameSearch: 'unavailable',
    });
    expect(discord.searchGuildMembers).not.toHaveBeenCalled();
  });

  it('au-delà de 60 recherches par minute sur ce serveur → unavailable, sans Discord', async () => {
    store.set(`ratelimit:member-search:guild:${GUILD}`, '60');

    expect((await search.search(GUILD, ACTOR, 'Fa')).nameSearch).toBe('unavailable');
    expect(discord.searchGuildMembers).not.toHaveBeenCalled();
  });

  it('Valkey en panne → unavailable, sans Discord (comme UserDirectory)', async () => {
    // Les deux lectures échouent : le cache de recherche, puis les profils
    redis.mget
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockRejectedValueOnce(new Error('ECONNREFUSED'));

    expect(await search.search(GUILD, ACTOR, 'Faye')).toEqual({
      userIds: [],
      nameSearch: 'unavailable',
    });
    expect(discord.searchGuildMembers).not.toHaveBeenCalled();
    // Un journal générique par partie (recherche et profils en cache), sans donnée
    expect(warn).toHaveBeenCalledWith('Member search cache unavailable, searching without names');
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged.toLowerCase()).not.toContain('faye');
    expect(logged).not.toContain(GUILD);
    expect(logged).not.toContain(ACTOR);
  });
});

describe('MemberSearch : profils déjà en cache (C11b)', () => {
  beforeEach(() => {
    // Discord ne trouve personne ici ; le beforeEach global le réinitialise avant chaque test
    discord.searchGuildMembers.mockImplementation(async () => []);
  });

  it('trouve les personnes sanctionnées ici dont le nom en cache COMMENCE par le texte, casse ignorée', async () => {
    profile(A, 'Fabien');
    profile(B, 'Alfa'); // contient « fa » sans commencer par
    profile(C, C); // profil d'échec : le nom est l'identifiant
    profile(E, 'Fanny'); // aucune sanction sur ce serveur

    const result = await search.search(GUILD, ACTOR, 'fa');

    expect(result).toEqual({ userIds: [A], nameSearch: 'used' });
    expect(db.case.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { guildId: GUILD }, take: 500 }),
    );
    // un seul aller-retour Valkey pour les profils, aucun appel Discord de plus
    const profileReads = redis.mget.mock.calls.filter(([key]) => key?.startsWith('discord:users:'));
    expect(profileReads).toHaveLength(1);
    expect(discord.searchGuildMembers).toHaveBeenCalledTimes(1);
  });

  it('un profil d’échec (nom = identifiant) qui commence par le texte est exclu', async () => {
    // 10 chiffres : ni un numéro de sanction (1 à 9) ni un identifiant Discord (17 à 20)
    const text = A.slice(0, 10);
    profile(A, A); // profil d'échec
    profile(B, `${text}-fan`); // vrai nom qui commence par le texte

    expect((await search.search(GUILD, ACTOR, text)).userIds).toEqual([B]);
  });

  it('un profil illisible ou sans nom est ignoré', async () => {
    store.set(`discord:users:${A}`, '{pas du json');
    store.set(`discord:users:${B}`, JSON.stringify({ id: B }));

    expect((await search.search(GUILD, ACTOR, 'fa')).userIds).toEqual([]);
  });

  it('Discord indisponible : les gens trouvés en cache servent quand même, nameSearch reste unavailable', async () => {
    profile(A, 'Fabien');
    discord.searchGuildMembers.mockRejectedValueOnce(discordError(429));

    expect(await search.search(GUILD, ACTOR, 'Fab')).toEqual({
      userIds: [A],
      nameSearch: 'unavailable',
    });
  });

  it('la base en panne : journalisée sans donnée, les profils en cache sont ignorés, Discord seul fait foi (used)', async () => {
    profile(A, 'Fabien');
    db.case.groupBy.mockRejectedValueOnce(new Error(`connection lost for ${GUILD}`));
    discord.searchGuildMembers.mockResolvedValueOnce([{ user: { id: FOUND } }]);

    expect(await search.search(GUILD, ACTOR, 'Fab')).toEqual({
      userIds: [FOUND],
      nameSearch: 'used',
    });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('Cached member profiles unavailable, searching without them');
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged.toLowerCase()).not.toContain('fab');
    expect(logged).not.toContain(GUILD);
    expect(logged).not.toContain(ACTOR);
  });

  it('fusionne sans doublon, Discord d’abord, 50 identifiants au plus', async () => {
    profile(A, 'Fabien');
    const many = Array.from({ length: 60 }, (_, i) => ({
      user: { id: `7000000000000001${String(i).padStart(2, '0')}` },
    }));
    discord.searchGuildMembers.mockResolvedValueOnce([{ user: { id: A } }, ...many]);

    const { userIds } = await search.search(GUILD, ACTOR, 'Fa');

    expect(userIds).toHaveLength(50);
    expect(new Set(userIds).size).toBe(50);
    expect(userIds[0]).toBe(A);
  });
});
