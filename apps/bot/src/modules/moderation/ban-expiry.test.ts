import type { Case } from '@phenix/database';
import { DiscordAPIError, RESTJSONErrorCodes, type Client } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BotContext } from '../../core/context.js';
import { liftExpiredBans } from './ban-expiry.js';

const database = vi.hoisted(() => ({
  findExpiredBans: vi.fn(),
  liftSanction: vi.fn(),
}));
vi.mock('@phenix/database', () => database);

const GUILD_ID = '111111111111111111';
const expiredBan = { guildId: GUILD_ID, targetId: '222222222222222222', number: 4 } as Case;

function setup(remove: () => Promise<unknown>) {
  const guild = { id: GUILD_ID, name: 'Les Agents', bans: { remove: vi.fn(remove) } };
  const client = {
    user: { id: '999999999999999999' },
    guilds: { cache: new Map([[GUILD_ID, guild]]) },
  } as unknown as Client<true>;
  const context = {
    db: {},
    configs: { get: vi.fn().mockResolvedValue(null) },
    logger: { info: vi.fn(), warn: vi.fn() },
  } as unknown as BotContext;
  return { guild, client, context };
}

beforeEach(() => {
  vi.clearAllMocks();
  database.findExpiredBans.mockResolvedValue([expiredBan]);
  database.liftSanction.mockResolvedValue({
    revoked: 1,
    record: { ...expiredBan, type: 'UNBAN', createdAt: new Date() },
  });
});

describe('liftExpiredBans', () => {
  it('lève le ban, clôt la case et en ouvre une de débannissement', async () => {
    const { guild, client, context } = setup(async () => undefined);

    expect(await liftExpiredBans(client, context)).toBe(1);

    expect(guild.bans.remove).toHaveBeenCalledWith(
      '222222222222222222',
      'Fin du bannissement temporaire (case #4)',
    );
    // une seule transaction, au nom du bot, notée « levée automatique »
    expect(database.liftSanction).toHaveBeenCalledWith(
      context.db,
      {
        guildId: GUILD_ID,
        guildName: 'Les Agents',
        targetId: '222222222222222222',
        type: 'BAN',
        actorId: '999999999999999999',
        reason: 'Fin du bannissement temporaire (case #4)',
        via: 'SCHEDULE',
      },
      expect.any(Date),
    );
  });

  it('clôt la case d’un ban déjà levé à la main', async () => {
    const unknownBan = new DiscordAPIError(
      { message: 'Unknown Ban', code: RESTJSONErrorCodes.UnknownBan },
      RESTJSONErrorCodes.UnknownBan,
      404,
      'DELETE',
      '/guilds/1/bans/2',
      {},
    );
    const { client, context } = setup(() => Promise.reject(unknownBan));

    expect(await liftExpiredBans(client, context)).toBe(1);
    expect(database.liftSanction).toHaveBeenCalled();
  });

  it('réessaiera plus tard si Discord refuse', async () => {
    const { client, context } = setup(() => Promise.reject(new Error('Missing Permissions')));

    expect(await liftExpiredBans(client, context)).toBe(0);
    expect(database.liftSanction).not.toHaveBeenCalled();
    expect(context.logger.warn).toHaveBeenCalled();
  });

  it('journalise le code de Discord, pas l’erreur : son adresse contient l’identifiant du banni', async () => {
    const refused = new DiscordAPIError(
      { message: 'Missing Permissions', code: RESTJSONErrorCodes.MissingPermissions },
      RESTJSONErrorCodes.MissingPermissions,
      403,
      'DELETE',
      '/guilds/111111111111111111/bans/222222222222222222',
      {},
    );
    const { client, context } = setup(() => Promise.reject(refused));

    await liftExpiredBans(client, context);

    const logged = JSON.stringify(vi.mocked(context.logger.warn).mock.calls);
    expect(logged).toContain(String(RESTJSONErrorCodes.MissingPermissions));
    expect(logged).not.toContain('222222222222222222');
  });

  it('ne compte pas un ban déjà levé entre-temps (depuis le site ou une commande)', async () => {
    database.liftSanction.mockResolvedValue({ revoked: 0, record: null });
    const { client, context } = setup(async () => undefined);

    expect(await liftExpiredBans(client, context)).toBe(0);
  });

  it('ne lit pas la base quand le bot n’est sur aucun serveur', async () => {
    const { context } = setup(async () => undefined);
    const empty = { guilds: { cache: new Map() } } as unknown as Client<true>;

    expect(await liftExpiredBans(empty, context)).toBe(0);
    expect(database.findExpiredBans).not.toHaveBeenCalled();
  });
});
