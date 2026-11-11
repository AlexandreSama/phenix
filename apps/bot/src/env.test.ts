import { describe, expect, it, vi } from 'vitest';
import { loadEnv } from './env.js';

const base = {
  DATABASE_URL: 'postgresql://projet:secret@localhost:5432/projet',
  REDIS_URL: 'redis://localhost:6379',
  DISCORD_TOKEN: 'token',
  DISCORD_CLIENT_ID: '123456789012345678',
  S3_ENDPOINT: 'http://localhost:3900',
  S3_ACCESS_KEY_ID: 'GK123',
  S3_SECRET_ACCESS_KEY: 'secret',
};

describe('loadEnv', () => {
  it('applique les valeurs par défaut', () => {
    const env = loadEnv(base);
    expect(env.NODE_ENV).toBe('development');
    expect(env.BOT_OWNER_IDS).toEqual([]);
  });

  it('découpe la liste des propriétaires et ignore un serveur de test vide', () => {
    const env = loadEnv({ ...base, BOT_OWNER_IDS: '111, 222', DISCORD_DEV_GUILD_ID: '' });
    expect(env.BOT_OWNER_IDS).toEqual(['111', '222']);
    expect(env.DISCORD_DEV_GUILD_ID).toBeUndefined();
  });

  it('stats TD2 : sans clé par défaut, et l’adresse de tracker.gg si rien n’est précisé', () => {
    expect(loadEnv({ ...base, TRN_API_KEY: '', TRN_API_URL: '' })).toMatchObject({
      TRN_API_KEY: undefined,
      TRN_API_URL: 'https://public-api.tracker.gg/v2',
    });
    expect(
      loadEnv({ ...base, TRN_API_KEY: 'cle', TRN_API_URL: 'http://localhost:4010/v2' }),
    ).toMatchObject({ TRN_API_KEY: 'cle', TRN_API_URL: 'http://localhost:4010/v2' });
  });

  it('arrête le processus si une variable obligatoire manque', () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    loadEnv({ DATABASE_URL: base.DATABASE_URL });

    expect(exit).toHaveBeenCalledWith(1);
    vi.restoreAllMocks();
  });
});
