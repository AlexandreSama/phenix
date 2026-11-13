import type { Case } from '@phenix/database';
import { LockBusyError, LockUnavailableError } from '@phenix/jobs';
import { MODERATION_BUSY_MESSAGE } from '@phenix/shared';
import {
  MessageFlags,
  type ChatInputCommandInteraction,
  type EmbedBuilder,
  type User,
} from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BotContext } from '../../core/context.js';
import { applySanction, type Sanction } from './sanction.js';

const modlog = vi.hoisted(() => ({ sendModLog: vi.fn(async (..._args: unknown[]) => {}) }));
vi.mock('./modlog.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./modlog.js')>()),
  sendModLog: modlog.sendModLog,
}));

const database = vi.hoisted(() => ({
  createCase: vi.fn(),
  revokeCases: vi.fn(),
  liftSanction: vi.fn(),
}));
vi.mock('@phenix/database', () => database);

const calls: string[] = [];

function fakeUser(dmOpen = true) {
  return {
    id: '222222222222222222',
    username: 'cible',
    toString: () => '<@222222222222222222>',
    send: vi.fn(async () => {
      calls.push('mp');
      if (!dmOpen) throw new Error('MP fermés');
    }),
  };
}

function fakeInteraction() {
  return {
    guild: { id: '111111111111111111', name: 'Les Agents' },
    user: { id: '333333333333333333', username: 'modo' },
    deferReply: vi.fn(),
    editReply: vi.fn(),
    reply: vi.fn(),
  };
}

const LOCK_KEY = 'moderation:lock:111111111111111111:222222222222222222';

// Le verrou par membre : par défaut, il exécute la sanction tout de suite
const locks = {
  withLock: vi.fn(async (_key: string, fn: () => Promise<unknown>) => fn()),
};

// Pas de salon de logs configuré : sendModLog s'arrête tout de suite
const context = {
  db: {},
  configs: { get: vi.fn().mockResolvedValue(null) },
  logger: { warn: vi.fn(), info: vi.fn() },
  locks,
} as unknown as BotContext;

function run(interaction: ReturnType<typeof fakeInteraction>, sanction: Sanction) {
  return applySanction(
    interaction as unknown as ChatInputCommandInteraction<'cached'>,
    sanction,
    context,
  );
}

function footerOf(interaction: ReturnType<typeof fakeInteraction>) {
  const [payload] = interaction.editReply.mock.calls[0] ?? [];
  return (payload as { embeds: EmbedBuilder[] } | undefined)?.embeds[0]?.data.footer?.text;
}

/** Rang d'appel de chaque fonction : vérifie l'ordre réel, pas seulement la présence. */
const order = (...mocks: { mock: { invocationCallOrder: number[] } }[]) =>
  mocks.map((mock) => mock.mock.invocationCallOrder[0] ?? Number.NaN);

beforeEach(() => {
  calls.length = 0;
  vi.clearAllMocks();
  database.createCase.mockImplementation(async (_db, input: Partial<Case>) => ({
    ...input,
    number: 7,
    createdAt: new Date(),
  }));
  database.liftSanction.mockImplementation(
    async (_db, input: { type: 'BAN' | 'MUTE'; targetId: string; actorId: string }) => ({
      revoked: 1,
      record: {
        type: input.type === 'BAN' ? 'UNBAN' : 'UNMUTE',
        targetId: input.targetId,
        moderatorId: input.actorId,
        reason: null,
        number: 7,
        createdAt: new Date(),
      },
    }),
  );
});

describe('applySanction', () => {
  it('prévient le membre avant d’agir, puis enregistre la case', async () => {
    const interaction = fakeInteraction();
    const act = vi.fn(async () => {
      calls.push('action');
    });

    await run(interaction, {
      type: 'MUTE',
      target: fakeUser() as unknown as User,
      reason: 'Spam',
      durationMs: 600_000,
      notify: true,
      act,
    });

    expect(calls).toEqual(['mp', 'action']);
    expect(act).toHaveBeenCalledWith('modo : Spam');
    const input = database.createCase.mock.calls[0]?.[1] as { expiresAt: Date };
    expect(input.expiresAt.getTime()).toBeGreaterThan(Date.now() + 590_000);
    expect(footerOf(interaction)).toBe('Case #7 · prévenu en MP');
  });

  it('continue quand les MP du membre sont fermés', async () => {
    const interaction = fakeInteraction();

    await run(interaction, {
      type: 'WARN',
      target: fakeUser(false) as unknown as User,
      reason: 'Insultes',
      notify: true,
    });

    expect(database.createCase).toHaveBeenCalled();
    expect(footerOf(interaction)).toBe('Case #7 · MP impossible');
  });

  it('un nouveau ban remplace l’ancien : lève les bans actifs puis crée la sanction', async () => {
    await run(fakeInteraction(), {
      type: 'BAN',
      target: fakeUser() as unknown as User,
      reason: null,
      notify: false,
      revokes: 'BAN',
    });

    expect(database.revokeCases).toHaveBeenCalledWith(
      context.db,
      expect.objectContaining({ type: 'BAN', targetId: '222222222222222222' }),
    );
    expect(database.createCase).toHaveBeenCalledWith(
      context.db,
      expect.objectContaining({ type: 'BAN' }),
    );
    expect(database.liftSanction).not.toHaveBeenCalled();
  });

  it.each([
    ['UNBAN', 'BAN'],
    ['UNMUTE', 'MUTE'],
  ] as const)(
    '%s passe par liftSanction, comme la levée du site : une transaction, au nom de la commande',
    async (type, lifted) => {
      const interaction = fakeInteraction();
      const act = vi.fn(async () => {
        calls.push('action');
      });

      await run(interaction, {
        type,
        target: fakeUser() as unknown as User,
        reason: 'Erreur',
        notify: false,
        revokes: lifted,
        act,
      });

      expect(database.liftSanction).toHaveBeenCalledWith(context.db, {
        guildId: '111111111111111111',
        guildName: 'Les Agents',
        targetId: '222222222222222222',
        type: lifted,
        actorId: '333333333333333333',
        reason: 'Erreur',
        via: 'COMMAND',
      });
      // plus de revokeCases puis createCase séparés : c'était la source des doublons
      expect(database.revokeCases).not.toHaveBeenCalled();
      expect(database.createCase).not.toHaveBeenCalled();
      expect(calls).toEqual(['action']);
      expect(footerOf(interaction)).toBe('Case #7');
    },
  );

  it('ne crée pas de doublon si la sanction était déjà levée (site, autre commande) : le dit au modérateur', async () => {
    database.liftSanction.mockResolvedValueOnce({ revoked: 0, record: null });
    const interaction = fakeInteraction();

    await run(interaction, {
      type: 'UNBAN',
      target: fakeUser() as unknown as User,
      reason: null,
      notify: false,
      revokes: 'BAN',
    });

    expect(database.createCase).not.toHaveBeenCalled();
    expect(footerOf(interaction)).toBe('Aucune sanction active à lever dans les cases');
  });

  it('garde une trace quand rien n’était actif : la raison au salon de logs, et un log applicatif sans la cible', async () => {
    database.liftSanction.mockResolvedValueOnce({ revoked: 0, record: null });

    await run(fakeInteraction(), {
      type: 'UNBAN',
      target: fakeUser() as unknown as User,
      reason: 'Ban posé par erreur',
      notify: false,
    });

    const embed = modlog.sendModLog.mock.calls[0]?.[1] as { data: { description?: string } };
    expect(embed.data.description).toContain('Ban posé par erreur');
    expect(embed.data.description).toContain('<@222222222222222222>');
    const logged = JSON.stringify(vi.mocked(context.logger.info).mock.calls);
    expect(logged).toContain('UNBAN');
    expect(logged).not.toContain('222222222222222222');
    expect(logged).not.toContain('Ban posé par erreur');
  });

  it('ne touche pas la base si Discord refuse la levée', async () => {
    const act = vi.fn().mockRejectedValue(new Error('Unknown Ban'));

    await expect(
      run(fakeInteraction(), {
        type: 'UNBAN',
        target: fakeUser() as unknown as User,
        reason: null,
        notify: false,
        revokes: 'BAN',
        act,
      }),
    ).rejects.toThrow('Unknown Ban');
    expect(database.liftSanction).not.toHaveBeenCalled();
  });

  it('ne crée aucune case si Discord refuse l’action', async () => {
    const act = vi.fn().mockRejectedValue(new Error('Missing Permissions'));

    await expect(
      run(fakeInteraction(), {
        type: 'KICK',
        target: fakeUser() as unknown as User,
        reason: null,
        notify: false,
        act,
      }),
    ).rejects.toThrow('Missing Permissions');
    expect(database.createCase).not.toHaveBeenCalled();
  });

  describe('verrou par membre', () => {
    it.each([
      ['BAN', database.createCase],
      ['MUTE', database.createCase],
      ['UNBAN', database.liftSanction],
      ['UNMUTE', database.liftSanction],
    ] as const)(
      '%s : verrou pris avant deferReply, puis MP, action Discord et case dans le verrou (ordre ; la libération réelle est prouvée par lock.test.ts)',
      async (type, write) => {
        const released = vi.fn();
        locks.withLock.mockImplementationOnce(async (_key, fn) => {
          try {
            return await fn();
          } finally {
            released();
          }
        });
        const interaction = fakeInteraction();
        const target = fakeUser();
        const act = vi.fn(async () => {});

        await run(interaction, {
          type,
          target: target as unknown as User,
          reason: null,
          notify: true,
          act,
        });

        expect(locks.withLock).toHaveBeenCalledTimes(1);
        expect(locks.withLock).toHaveBeenCalledWith(LOCK_KEY, expect.any(Function));
        const ranks = order(
          locks.withLock,
          interaction.deferReply,
          target.send,
          act,
          write,
          released,
        );
        expect(ranks.every(Number.isFinite)).toBe(true);
        expect(ranks).toEqual(ranks.toSorted((a, b) => a - b));
      },
    );

    it.each(['WARN', 'KICK'] as const)('%s ne prend pas le verrou', async (type) => {
      await run(fakeInteraction(), {
        type,
        target: fakeUser() as unknown as User,
        reason: null,
        notify: false,
        act: vi.fn(async () => {}),
      });

      expect(locks.withLock).not.toHaveBeenCalled();
      expect(database.createCase).toHaveBeenCalled();
    });

    it('verrou déjà pris : réponse éphémère, sans MP, sans action Discord, sans case', async () => {
      locks.withLock.mockRejectedValueOnce(new LockBusyError(LOCK_KEY));
      const interaction = fakeInteraction();
      const target = fakeUser();
      const act = vi.fn(async () => {});

      await run(interaction, {
        type: 'BAN',
        target: target as unknown as User,
        reason: null,
        notify: true,
        revokes: 'BAN',
        act,
      });

      expect(interaction.reply).toHaveBeenCalledWith({
        content: MODERATION_BUSY_MESSAGE,
        flags: MessageFlags.Ephemeral,
      });
      expect(interaction.deferReply).not.toHaveBeenCalled();
      expect(target.send).not.toHaveBeenCalled();
      expect(act).not.toHaveBeenCalled();
      expect(database.revokeCases).not.toHaveBeenCalled();
      expect(database.createCase).not.toHaveBeenCalled();
    });

    it('Discord refuse : l’erreur traverse le verrou sans créer de case (la libération réelle est prouvée par lock.test.ts)', async () => {
      const released = vi.fn();
      locks.withLock.mockImplementationOnce(async (_key, fn) => {
        try {
          return await fn();
        } finally {
          released();
        }
      });
      const act = vi.fn().mockRejectedValue(new Error('Missing Permissions'));

      await expect(
        run(fakeInteraction(), {
          type: 'MUTE',
          target: fakeUser() as unknown as User,
          reason: null,
          notify: false,
          act,
        }),
      ).rejects.toThrow('Missing Permissions');
      expect(released).toHaveBeenCalledTimes(1);
      expect(database.createCase).not.toHaveBeenCalled();
    });

    it('Valkey indisponible : la commande agit quand même, avec un avertissement sans la cible', async () => {
      locks.withLock.mockRejectedValueOnce(new LockUnavailableError(LOCK_KEY));
      const interaction = fakeInteraction();
      const act = vi.fn(async () => {});

      await run(interaction, {
        type: 'BAN',
        target: fakeUser() as unknown as User,
        reason: null,
        notify: false,
        act,
      });

      expect(interaction.deferReply).toHaveBeenCalledTimes(1);
      expect(act).toHaveBeenCalledTimes(1);
      expect(database.createCase).toHaveBeenCalledTimes(1);
      expect(context.logger.warn).toHaveBeenCalledTimes(1);
      const logged = JSON.stringify(vi.mocked(context.logger.warn).mock.calls);
      expect(logged).toContain('111111111111111111');
      expect(logged).not.toContain('222222222222222222');
    });
  });
});
