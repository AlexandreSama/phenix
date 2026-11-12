import type { Case } from '@phenix/database';
import type { Client } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BotContext } from '../../core/context.js';
import { publishDashboardLog } from './dashboard-log.js';

const database = vi.hoisted(() => ({ findCaseById: vi.fn() }));
vi.mock('@phenix/database', () => database);
const modlog = vi.hoisted(() => ({ sendModLog: vi.fn(async (..._args: unknown[]) => {}) }));
vi.mock('./modlog.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./modlog.js')>()),
  sendModLog: modlog.sendModLog,
}));

const GUILD = '111111111111111111';
const guild = { id: GUILD, name: 'Les Agents' };
const client = { guilds: { cache: new Map([[GUILD, guild]]) } } as unknown as Client<true>;
const context = {
  db: {},
  logger: { warn: vi.fn(), info: vi.fn() },
} as unknown as BotContext;

const record = (over: Partial<Case>): Case => ({
  id: 42,
  guildId: GUILD,
  number: 9,
  type: 'UNBAN',
  targetId: '222222222222222222',
  moderatorId: '333333333333333333',
  reason: 'Erreur de modération',
  expiresAt: null,
  revokedAt: null,
  revokedById: null,
  revokedVia: null,
  createdAt: new Date('2026-11-12T10:00:00Z'),
  ...over,
});

beforeEach(() => vi.clearAllMocks());

describe('publishDashboardLog', () => {
  it.each(['UNBAN', 'UNMUTE'] as const)(
    'publie la sanction de fin (%s) avec l’embed des sanctions du bot',
    async (type) => {
      database.findCaseById.mockResolvedValue(record({ type }));

      await publishDashboardLog(client, context, { guildId: GUILD, caseId: 42 });

      expect(database.findCaseById).toHaveBeenCalledWith(context.db, GUILD, 42);
      expect(modlog.sendModLog).toHaveBeenCalledTimes(1);
      expect(modlog.sendModLog).toHaveBeenCalledWith(guild, expect.anything(), context);
    },
  );

  it('publie le retrait d’un avertissement, qui n’a pas de sanction de fin', async () => {
    database.findCaseById.mockResolvedValue(
      record({
        type: 'WARN',
        revokedAt: new Date(),
        revokedById: '333333333333333333',
        revokedVia: 'DASHBOARD',
      }),
    );

    await publishDashboardLog(client, context, { guildId: GUILD, caseId: 42 });

    const embed = vi.mocked(modlog.sendModLog).mock.calls[0]?.[1] as unknown as {
      data: { title?: string; description?: string };
    };
    expect(embed.data.title).toBe('Avertissement retiré');
    expect(embed.data.description).toContain('#9');
    expect(embed.data.description).toContain('<@222222222222222222>');
  });

  it.each([
    [
      'un avertissement retiré par /clearwarn : il ne vient pas du site',
      { type: 'WARN', revokedVia: 'COMMAND' },
    ],
    [
      'un avertissement sans date de levée',
      { type: 'WARN', revokedAt: null, revokedVia: 'DASHBOARD' },
    ],
    [
      'un avertissement sans auteur de levée',
      { type: 'WARN', revokedById: null, revokedVia: 'DASHBOARD' },
    ],
    ['un avertissement levé avant le suivi de l’origine', { type: 'WARN', revokedVia: null }],
    [
      'un bannissement, même levé (la sanction de fin est l’UNBAN)',
      { type: 'BAN', revokedVia: 'DASHBOARD' },
    ],
    ['une sourdine, même levée', { type: 'MUTE', revokedVia: 'DASHBOARD' }],
    ['une expulsion', { type: 'KICK' }],
  ] as const)('ne publie rien pour %s (événement forgé, rejoué ou périmé)', async (_nom, over) => {
    database.findCaseById.mockResolvedValue(
      record({ revokedAt: new Date(), revokedById: '333333333333333333', ...over }),
    );

    await publishDashboardLog(client, context, { guildId: GUILD, caseId: 42 });

    expect(modlog.sendModLog).not.toHaveBeenCalled();
  });

  it('ne publie rien pour une sanction qui n’est pas levée (un événement forgé ou périmé)', async () => {
    database.findCaseById.mockResolvedValue(record({ type: 'WARN', revokedAt: null }));

    await publishDashboardLog(client, context, { guildId: GUILD, caseId: 42 });

    expect(modlog.sendModLog).not.toHaveBeenCalled();
  });

  it('signale une sanction introuvable, sans donnée personnelle', async () => {
    database.findCaseById.mockResolvedValue(null);

    await publishDashboardLog(client, context, { guildId: GUILD, caseId: 42 });

    expect(modlog.sendModLog).not.toHaveBeenCalled();
    expect(context.logger.warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(vi.mocked(context.logger.warn).mock.calls)).not.toContain(
      '222222222222222222',
    );
  });

  it('ne fait rien pour un serveur où le bot n’est plus', async () => {
    await publishDashboardLog(client, context, { guildId: '999999999999999999', caseId: 42 });

    expect(database.findCaseById).not.toHaveBeenCalled();
    expect(modlog.sendModLog).not.toHaveBeenCalled();
  });
});
