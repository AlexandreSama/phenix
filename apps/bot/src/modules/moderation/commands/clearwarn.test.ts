import type { ChatInputCommandInteraction } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BotContext } from '../../../core/context.js';
import { clearwarn } from './clearwarn.js';

const database = vi.hoisted(() => ({ revokeCases: vi.fn() }));
vi.mock('@phenix/database', () => database);

const MODERATOR = '333333333333333333';
const OTHER = '222222222222222222';

function fakeInteraction(targetId: string) {
  return {
    inCachedGuild: () => true,
    guildId: '111111111111111111',
    guild: { id: '111111111111111111' },
    user: { id: MODERATOR, username: 'modo', toString: () => `<@${MODERATOR}>` },
    options: {
      getUser: () => ({ id: targetId, toString: () => `<@${targetId}>` }),
      getInteger: () => null,
    },
    reply: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  database.revokeCases.mockResolvedValue(1);
});

describe('/clearwarn', () => {
  it('refuse à un modérateur de retirer ses propres avertissements, comme le site', async () => {
    const interaction = fakeInteraction(MODERATOR);

    await clearwarn.execute(
      interaction as unknown as ChatInputCommandInteraction,
      {
        db: {},
        configs: { get: vi.fn() },
        logger: { warn: vi.fn() },
      } as unknown as BotContext,
    );

    expect(database.revokeCases).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith({
      content: expect.stringContaining('propres avertissements'),
      flags: expect.anything(),
    });
  });

  it('retire les avertissements d’un autre membre', async () => {
    const interaction = fakeInteraction(OTHER);

    await clearwarn.execute(
      interaction as unknown as ChatInputCommandInteraction,
      {
        db: {},
        configs: { get: vi.fn().mockResolvedValue(null) },
        logger: { warn: vi.fn() },
      } as unknown as BotContext,
    );

    expect(database.revokeCases).toHaveBeenCalledTimes(1);
  });
});
