import type { Case } from '@phenix/database';
import { LockBusyError, LockUnavailableError } from '@phenix/jobs';
import { DiscordAPIError, RESTJSONErrorCodes, type Client } from 'discord.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BotContext } from '../../core/context.js';
import { isBanStillDue, liftExpiredBans, startBanExpiry } from './ban-expiry.js';
import { caseEmbed } from './case-format.js';
import { sendModLog } from './modlog.js';

const database = vi.hoisted(() => ({
  findExpiredBans: vi.fn(),
  findActiveCases: vi.fn(),
  liftSanction: vi.fn(),
}));
vi.mock('@phenix/database', () => database);
vi.mock('./modlog.js', () => ({ sendModLog: vi.fn().mockResolvedValue(undefined) }));

const GUILD_ID = '111111111111111111';
const TARGET_ID = '222222222222222222';
const LOCK_KEY = `moderation:lock:${GUILD_ID}:${TARGET_ID}`;
const expiredBan = {
  guildId: GUILD_ID,
  targetId: TARGET_ID,
  number: 4,
  expiresAt: new Date(Date.now() - 60_000),
} as Case;

function setup(remove: () => Promise<unknown>) {
  const guild = { id: GUILD_ID, name: 'Les Agents', bans: { remove: vi.fn(remove) } };
  const client = {
    user: { id: '999999999999999999' },
    guilds: { cache: new Map([[GUILD_ID, guild]]) },
  } as unknown as Client<true>;
  const locks = { withLock: vi.fn(async (_key: string, fn: () => Promise<unknown>) => fn()) };
  const context = {
    db: {},
    configs: { get: vi.fn().mockResolvedValue(null) },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    locks,
  } as unknown as BotContext;
  return { guild, client, context, locks };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(sendModLog).mockResolvedValue(undefined);
  database.findExpiredBans.mockResolvedValue([expiredBan]);
  // La relecture sous verrou : par défaut, le ban est toujours le seul actif
  database.findActiveCases.mockResolvedValue([expiredBan]);
  database.liftSanction.mockResolvedValue({
    revoked: 1,
    record: { ...expiredBan, type: 'UNBAN', createdAt: new Date() },
  });
});

describe('liftExpiredBans', () => {
  it('lève le ban, clôt la case et en ouvre une de débannissement', async () => {
    const { guild, client, context } = setup(async () => undefined);
    // un instant fixe, distinct de l'horloge, postérieur à l'échéance du ban
    const now = new Date(expiredBan.expiresAt!.getTime() + 5_000);

    expect(await liftExpiredBans(client, context, now)).toBe(1);

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
      now, // le même instant que la lecture des bans échus, pas un nouveau `new Date()`
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

  it('verrouille le membre, relit ses bans actifs, puis lève dans Discord et dans la base, dans cet ordre', async () => {
    const { guild, client, context, locks } = setup(async () => undefined);
    const now = new Date();

    expect(await liftExpiredBans(client, context, now)).toBe(1);

    expect(locks.withLock).toHaveBeenCalledWith(LOCK_KEY, expect.any(Function));
    expect(database.findActiveCases).toHaveBeenCalledWith(
      context.db,
      GUILD_ID,
      TARGET_ID,
      'BAN',
      now,
    );
    const ranks = [
      locks.withLock,
      database.findActiveCases,
      guild.bans.remove,
      database.liftSanction,
    ].map((mock) => mock.mock.invocationCallOrder[0] ?? Number.NaN);
    expect(ranks.every(Number.isFinite)).toBe(true);
    expect(ranks).toEqual(ranks.toSorted((a, b) => a - b));
  });

  it('ne débannit pas un ban prolongé par un /ban concurrent', async () => {
    // findExpiredBans a vu #4 ; entre-temps un /ban l'a remplacé par #6, qui court encore
    database.findActiveCases.mockResolvedValue([
      { ...expiredBan, number: 6, expiresAt: new Date(Date.now() + 3_600_000) },
    ]);
    const { guild, client, context } = setup(async () => undefined);

    expect(await liftExpiredBans(client, context)).toBe(0);
    expect(guild.bans.remove).not.toHaveBeenCalled();
    expect(database.liftSanction).not.toHaveBeenCalled();
  });

  it('ne touche pas Discord si la relecture ne trouve plus aucun ban actif', async () => {
    database.findActiveCases.mockResolvedValue([]);
    const { guild, client, context } = setup(async () => undefined);

    expect(await liftExpiredBans(client, context)).toBe(0);
    expect(guild.bans.remove).not.toHaveBeenCalled();
    expect(database.liftSanction).not.toHaveBeenCalled();
  });

  it('verrou pris par une commande : passe ce ban, repris au passage suivant', async () => {
    const other = { ...expiredBan, targetId: '444444444444444444', number: 5 } as Case;
    database.findExpiredBans.mockResolvedValue([expiredBan, other]);
    database.findActiveCases.mockImplementation(async (_db, _guildId, targetId: string) =>
      targetId === other.targetId ? [other] : [expiredBan],
    );
    const { guild, client, context, locks } = setup(async () => undefined);
    locks.withLock.mockRejectedValueOnce(new LockBusyError(LOCK_KEY));

    expect(await liftExpiredBans(client, context)).toBe(1);
    expect(guild.bans.remove).toHaveBeenCalledTimes(1);
    expect(guild.bans.remove).toHaveBeenCalledWith('444444444444444444', expect.any(String));
  });

  it('Valkey indisponible : rien n’est levé, avertissement sans la cible', async () => {
    const { guild, client, context, locks } = setup(async () => undefined);
    locks.withLock.mockRejectedValue(new LockUnavailableError(LOCK_KEY));

    expect(await liftExpiredBans(client, context)).toBe(0);
    expect(database.findActiveCases).not.toHaveBeenCalled();
    expect(guild.bans.remove).not.toHaveBeenCalled();
    expect(database.liftSanction).not.toHaveBeenCalled();
    expect(context.logger.warn).toHaveBeenCalled();
    expect(JSON.stringify(vi.mocked(context.logger.warn).mock.calls)).not.toContain(TARGET_ID);
  });

  it('Valkey indisponible : arrête le passage dès le premier ban, les suivants ne sont pas tentés', async () => {
    const other = { ...expiredBan, targetId: '444444444444444444', number: 5 } as Case;
    database.findExpiredBans.mockResolvedValue([expiredBan, other]);
    const { client, context, locks } = setup(async () => undefined);
    locks.withLock.mockRejectedValue(new LockUnavailableError(LOCK_KEY));

    expect(await liftExpiredBans(client, context)).toBe(0);
    expect(locks.withLock).toHaveBeenCalledTimes(1);
    expect(database.findActiveCases).not.toHaveBeenCalled();
  });

  it.each([
    ['liftSanction', () => database.liftSanction],
    ['findActiveCases', () => database.findActiveCases],
  ])(
    'erreur de base (%s) non liée au verrou : elle remonte, sans compter le ban ni écrire au journal',
    async (_name, failing) => {
      failing().mockRejectedValue(new Error('db'));
      const { client, context } = setup(async () => undefined);

      await expect(liftExpiredBans(client, context)).rejects.toThrow('db');
      expect(sendModLog).not.toHaveBeenCalled();
      expect(context.logger.info).not.toHaveBeenCalled();
    },
  );

  it('ne lit que les serveurs où se trouve le bot, à l’instant donné', async () => {
    const { client, context } = setup(async () => undefined);
    const now = new Date('2026-11-13T10:00:00Z');

    await liftExpiredBans(client, context, now);

    expect(database.findExpiredBans).toHaveBeenCalledTimes(1);
    expect(database.findExpiredBans).toHaveBeenCalledWith(context.db, [GUILD_ID], now);
  });

  it('publie dans le journal de modération l’embed de la case de débannissement', async () => {
    const { guild, client, context } = setup(async () => undefined);
    const record = { ...expiredBan, number: 9, type: 'UNBAN', createdAt: new Date() } as Case;
    database.liftSanction.mockResolvedValue({ revoked: 1, record });

    await liftExpiredBans(client, context);

    expect(sendModLog).toHaveBeenCalledTimes(1);
    expect(sendModLog).toHaveBeenCalledWith(guild, caseEmbed(record), context);
  });

  it('n’écrit pas au journal de modération quand rien n’a été levé (record null)', async () => {
    database.liftSanction.mockResolvedValue({ revoked: 0, record: null });
    const { client, context } = setup(async () => undefined);

    await liftExpiredBans(client, context);

    expect(sendModLog).not.toHaveBeenCalled();
  });

  it('un identifiant de cible invalide (ligne corrompue) ne bloque pas les autres bans, et n’est pas journalisé', async () => {
    const corrupt = { ...expiredBan, targetId: 'abc', number: 3 } as Case;
    database.findExpiredBans.mockResolvedValue([corrupt, expiredBan]);
    const { guild, client, context, locks } = setup(async () => undefined);

    expect(await liftExpiredBans(client, context)).toBe(1);

    expect(locks.withLock).toHaveBeenCalledTimes(1);
    expect(locks.withLock).toHaveBeenCalledWith(LOCK_KEY, expect.any(Function));
    expect(guild.bans.remove).toHaveBeenCalledTimes(1);
    expect(context.logger.warn).toHaveBeenCalledTimes(1);
    expect(context.logger.warn).toHaveBeenCalledWith(
      { guildId: GUILD_ID, case: 3 },
      expect.any(String),
    );
    expect(JSON.stringify(vi.mocked(context.logger.warn).mock.calls)).not.toContain('abc');
  });

  it('ignore le ban d’un serveur absent du cache, sans verrou, et traite le suivant', async () => {
    const orphan = { ...expiredBan, guildId: '333333333333333333', number: 3 } as Case;
    database.findExpiredBans.mockResolvedValue([orphan, expiredBan]);
    const { guild, client, context, locks } = setup(async () => undefined);

    expect(await liftExpiredBans(client, context)).toBe(1);
    expect(locks.withLock).toHaveBeenCalledTimes(1);
    expect(locks.withLock).toHaveBeenCalledWith(LOCK_KEY, expect.any(Function));
    expect(guild.bans.remove).toHaveBeenCalledTimes(1);
  });
});

describe('isBanStillDue', () => {
  const now = new Date('2026-11-13T10:00:00Z');
  const due = { number: 4, expiresAt: new Date('2026-11-13T09:00:00Z') } as Case;
  const future = { number: 6, expiresAt: new Date('2026-11-13T11:00:00Z') } as Case;
  const permanent = { number: 7, expiresAt: null } as Case;

  it('faux si plus aucun ban n’est actif (déjà levé ailleurs)', () => {
    expect(isBanStillDue([], due, now)).toBe(false);
  });

  it('vrai si le seul ban actif est celui qui est échu', () => {
    expect(isBanStillDue([due], due, now)).toBe(true);
  });

  it('faux si un ban plus récent court encore', () => {
    expect(isBanStillDue([future, due], due, now)).toBe(false);
  });

  it('faux si un ban définitif s’y ajoute', () => {
    expect(isBanStillDue([permanent, due], due, now)).toBe(false);
  });

  it('vrai si le ban vu est le plus récent et qu’un plus ancien, échu aussi, est encore actif', () => {
    const newer = { number: 4, expiresAt: new Date('2026-11-13T09:00:00Z') } as Case;
    const older = { number: 3, expiresAt: new Date('2026-11-13T08:00:00Z') } as Case;
    expect(isBanStillDue([newer, older], newer, now)).toBe(true);
  });

  it('vrai à la milliseconde de l’échéance, comme findExpiredBans (lte)', () => {
    const exact = { number: 4, expiresAt: now } as Case;
    expect(isBanStillDue([exact], exact, now)).toBe(true);
  });

  it('faux si le ban vu n’est plus parmi les actifs : un autre l’a remplacé, il sera repris pour lui-même', () => {
    const replacement = { number: 6, expiresAt: new Date('2026-11-13T09:30:00Z') } as Case;
    expect(isBanStillDue([replacement], due, now)).toBe(false);
  });
});

describe('startBanExpiry', () => {
  const INTERVAL = 1_000;

  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('ne superpose pas un passage lent au suivant, puis reprend quand il est fini', async () => {
    const slow = Promise.withResolvers<Case[]>();
    database.findExpiredBans.mockImplementationOnce(() => slow.promise);
    database.findExpiredBans.mockResolvedValue([]);
    const { client, context } = setup(async () => undefined);
    const stop = startBanExpiry(client, context, INTERVAL);

    await vi.advanceTimersByTimeAsync(INTERVAL * 3);
    expect(database.findExpiredBans).toHaveBeenCalledTimes(1);

    slow.resolve([]);
    await vi.advanceTimersByTimeAsync(INTERVAL);
    expect(database.findExpiredBans).toHaveBeenCalledTimes(2);
    stop();
  });

  it('journalise l’échec d’un passage et réessaie au suivant', async () => {
    const failure = new Error('db');
    database.findExpiredBans.mockRejectedValueOnce(failure);
    database.findExpiredBans.mockResolvedValue([]);
    const { client, context } = setup(async () => undefined);
    const stop = startBanExpiry(client, context, INTERVAL);

    await vi.advanceTimersByTimeAsync(INTERVAL);
    expect(context.logger.error).toHaveBeenCalledTimes(1);
    expect(context.logger.error).toHaveBeenCalledWith(
      { err: failure },
      'Échec de la levée des bans',
    );

    await vi.advanceTimersByTimeAsync(INTERVAL);
    expect(database.findExpiredBans).toHaveBeenCalledTimes(2);
    expect(context.logger.error).toHaveBeenCalledTimes(1);
    stop();
  });

  it('la fonction renvoyée arrête la boucle', async () => {
    database.findExpiredBans.mockResolvedValue([]);
    const { client, context } = setup(async () => undefined);
    const stop = startBanExpiry(client, context, INTERVAL);

    await vi.advanceTimersByTimeAsync(INTERVAL);
    expect(database.findExpiredBans).toHaveBeenCalledTimes(1);

    stop();
    await vi.advanceTimersByTimeAsync(INTERVAL * 5);
    expect(database.findExpiredBans).toHaveBeenCalledTimes(1);
  });
});
