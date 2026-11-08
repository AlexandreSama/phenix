import { getMemberRank } from '@phenix/database';
import type { ChatInputCommandInteraction } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import type { BotContext } from '../../../core/context.js';
import { rank } from './rank.js';

vi.mock('@projet/database', () => ({ getMemberRank: vi.fn() }));

const me = { id: '200000000000000001', bot: false, displayName: 'Moi' };

/** Fausse interaction : seulement ce que /rank lit. */
function fakeInteraction(target: object | null) {
  return {
    inCachedGuild: () => true,
    guildId: '100000000000000001',
    user: me,
    member: null,
    options: { getUser: () => target, getMember: () => null },
    reply: vi.fn(),
  };
}

const context = { db: {} } as BotContext;

async function run(target: object | null) {
  const interaction = fakeInteraction(target);
  await rank.execute(interaction as unknown as ChatInputCommandInteraction, context);
  return interaction.reply.mock.calls[0]?.[0] as { content?: string; embeds?: unknown[] };
}

describe('/rank', () => {
  it('rappelle que les bots ne gagnent pas d’XP', async () => {
    expect((await run({ id: '9', bot: true })).content).toBe("Les bots ne gagnent pas d'XP.");
    expect(getMemberRank).not.toHaveBeenCalled();
  });

  it('prévient un membre qui n’a encore rien gagné', async () => {
    vi.mocked(getMemberRank).mockResolvedValue(null);
    expect((await run(null)).content).toContain("Tu n'as pas encore gagné d'XP");
  });
});
