import { Logger } from '@nestjs/common';
import { DiscordAPIError } from '@discordjs/rest';
import type { Redis } from 'ioredis';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CacheService } from '../../core/cache.service.js';
import { UserDirectory } from './user-directory.js';

const store = new Map<string, string>();
const redis = {
  get: vi.fn(async (key: string) => store.get(key) ?? null),
  mget: vi.fn(async (...keys: string[]) => keys.map((key) => store.get(key) ?? null)),
  set: vi.fn(async (key: string, value: string, _mode?: string, _seconds?: number) => {
    store.set(key, value);
    return 'OK';
  }),
};
const discord = {
  getUser: vi.fn(async (id: string, _signal?: AbortSignal) => ({
    id,
    username: `user${id.slice(-2)}`,
    global_name: id.endsWith('01') ? 'Alpha' : null,
    avatar: id.endsWith('01') ? 'f00d' : null,
  })),
};
const newDirectory = () => new UserDirectory(new CacheService(redis as unknown as Redis), discord);
let directory = newDirectory();

const A = '500000000000000001';
const B = '500000000000000002';
const fallback = (id: string) => ({ id, name: id, avatarUrl: null });
const discordError = (status: number) =>
  new DiscordAPIError({ code: 0, message: 'x' }, 0, status, 'GET', `/users/${A}`, {
    body: undefined,
    files: undefined,
  });

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  store.clear();
  vi.clearAllMocks();
  directory = newDirectory();
  warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe('UserDirectory', () => {
  it('résout chaque identifiant une seule fois, même répété', async () => {
    const users = await directory.resolve([A, B, A, A]);

    expect(discord.getUser).toHaveBeenCalledTimes(2);
    expect(users.get(A)).toEqual({
      id: A,
      name: 'Alpha',
      avatarUrl: `https://cdn.discordapp.com/avatars/${A}/f00d.png?size=64`,
    });
    expect(users.get(B)).toEqual({ id: B, name: 'user02', avatarUrl: null });
  });

  it('lit tout le cache d’un seul coup, et garde le profil 300 secondes sous discord:users:<id>', async () => {
    await directory.resolve([A, B]);

    expect(redis.mget).toHaveBeenCalledTimes(1);
    expect(redis.mget).toHaveBeenCalledWith(`discord:users:${A}`, `discord:users:${B}`);
    expect(redis.set).toHaveBeenCalledWith(`discord:users:${A}`, expect.any(String), 'EX', 300);
    await directory.resolve([A, B]);
    expect(discord.getUser).toHaveBeenCalledTimes(2);
  });

  it('se replie sur l’identifiant si Discord échoue, et garde cet échec 60 secondes', async () => {
    discord.getUser.mockRejectedValueOnce(new Error('503'));

    const users = await directory.resolve([A]);

    expect(users.get(A)).toEqual(fallback(A));
    expect(redis.set).toHaveBeenCalledWith(
      `discord:users:${A}`,
      JSON.stringify(fallback(A)),
      'EX',
      60,
    );
    // l'échec gardé évite de réinterroger Discord à chaque rafraîchissement
    await directory.resolve([A]);
    expect(discord.getUser).toHaveBeenCalledTimes(1);
  });

  it('se replie sur l’identifiant si Valkey est en panne, sans interroger Discord', async () => {
    redis.mget.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const users = await directory.resolve([A]);

    expect(users.get(A)).toEqual(fallback(A));
    expect(discord.getUser).not.toHaveBeenCalled();
  });

  it('ne demande à Discord que 10 profils absents du cache, 4 à la fois', async () => {
    const ids = Array.from(
      { length: 25 },
      (_, i) => `5000000000000001${String(i).padStart(2, '0')}`,
    );
    let running = 0;
    let peak = 0;
    discord.getUser.mockImplementation(async (id: string) => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running -= 1;
      return { id, username: `u${id}`, global_name: null, avatar: null };
    });

    const users = await directory.resolve(ids);

    expect(discord.getUser).toHaveBeenCalledTimes(10);
    expect(peak).toBeLessThanOrEqual(4);
    // les autres s'affichent avec leur identifiant, sans garder ce repli en cache
    expect(users.get(ids[24]!)).toEqual(fallback(ids[24]!));
    expect(store.has(`discord:users:${ids[24]}`)).toBe(false);
  });

  it('ne lance qu’un appel pour un même identifiant demandé en même temps', async () => {
    discord.getUser.mockImplementation(async (id: string) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return { id, username: 'x', global_name: null, avatar: null };
    });

    await Promise.all([directory.resolve([A]), directory.resolve([A]), directory.resolve([A])]);

    expect(discord.getUser).toHaveBeenCalledTimes(1);
  });

  it('coupe l’attente de Discord après l’échéance et affiche l’identifiant', async () => {
    discord.getUser.mockImplementation(
      (_id: string, signal?: AbortSignal) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );

    const users = await directory.resolve([A], { deadlineMs: 20 });

    expect(users.get(A)).toEqual(fallback(A));
    expect(discord.getUser.mock.calls[0]?.[1]).toBeInstanceOf(AbortSignal);
  });

  it.each([401, 403, 429])(
    'signale un statut %i de Discord (jeton révoqué ou limite), sans identifiant',
    async (status) => {
      discord.getUser.mockRejectedValueOnce(discordError(status));

      await directory.resolve([A]);

      expect(warn).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(warn.mock.calls)).toContain(String(status));
      expect(JSON.stringify(warn.mock.calls)).not.toContain(A);
    },
  );

  it('ne signale pas un compte introuvable (404)', async () => {
    discord.getUser.mockRejectedValueOnce(discordError(404));

    await directory.resolve([A]);

    expect(warn).not.toHaveBeenCalled();
  });
});
