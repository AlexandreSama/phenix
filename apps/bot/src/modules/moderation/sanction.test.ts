import type { Case } from '@phenix/database';
import type { ChatInputCommandInteraction, EmbedBuilder, User } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BotContext } from '../../core/context.js';
import { applySanction, auditReason, type Sanction } from './sanction.js';

const database = vi.hoisted(() => ({ createCase: vi.fn(), revokeCases: vi.fn() }));
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
  };
}

// Pas de salon de logs configuré : sendModLog s'arrête tout de suite
const context = {
  db: { guildConfig: { findUnique: vi.fn().mockResolvedValue(null) } },
  logger: { warn: vi.fn() },
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

beforeEach(() => {
  calls.length = 0;
  vi.clearAllMocks();
  database.createCase.mockImplementation(async (_db, input: Partial<Case>) => ({
    ...input,
    number: 7,
    createdAt: new Date(),
  }));
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

  it('lève les sanctions remplacées avant de créer la nouvelle', async () => {
    await run(fakeInteraction(), {
      type: 'UNBAN',
      target: fakeUser() as unknown as User,
      reason: null,
      notify: false,
      revokes: 'BAN',
    });

    expect(database.revokeCases).toHaveBeenCalledWith(
      context.db,
      expect.objectContaining({ type: 'BAN', targetId: '222222222222222222' }),
    );
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
});

describe('auditReason', () => {
  it('nomme le modérateur et coupe à 512 caractères', () => {
    const moderator = { username: 'modo' } as User;
    expect(auditReason(moderator, null)).toBe('modo : Aucune raison fournie');
    expect(auditReason(moderator, 'x'.repeat(600))).toHaveLength(512);
  });
});
