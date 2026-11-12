import { ChannelType, PermissionFlagsBits, type ChatInputCommandInteraction } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import type { BotContext } from '../../../core/context.js';
import { lockCommand } from './lock.js';

const EVERYONE = '111111111111111111';

/** Un salon où @everyone peut encore écrire ; `permissionsFor` dit ce que le membre y peut. */
function fakeChannel(memberCanManage: boolean) {
  return {
    id: '400000000000000001',
    type: ChannelType.GuildText,
    guild: { roles: { everyone: { id: EVERYONE } } },
    permissionOverwrites: { cache: new Map(), edit: vi.fn(async () => {}) },
    permissionsFor: () => ({
      has: (flag: bigint) => flag === PermissionFlagsBits.ManageChannels && memberCanManage,
    }),
    toString: () => '<#400000000000000001>',
  };
}

function fakeInteraction(target: ReturnType<typeof fakeChannel>) {
  return {
    inCachedGuild: () => true,
    guild: { roles: { everyone: { id: EVERYONE } } },
    member: {},
    user: { username: 'modo', toString: () => '<@3>' },
    // Le routeur a laissé passer : le membre a « Gérer les salons » là où il tape la commande
    channel: fakeChannel(true),
    options: { getChannel: () => target, getString: () => null },
    reply: vi.fn(),
  };
}

const context = {
  db: {},
  configs: { get: vi.fn().mockResolvedValue(null) },
  logger: { warn: vi.fn() },
} as unknown as BotContext;

describe('/lock', () => {
  it('refuse de verrouiller un salon visé où le membre n’a pas « Gérer les salons »', async () => {
    // « Gérer les salons » peut être accordé salon par salon : le routeur ne voit que le salon
    // où la commande est tapée, pas celui qu'on vise
    const target = fakeChannel(false);
    const interaction = fakeInteraction(target);

    await lockCommand.execute(interaction as unknown as ChatInputCommandInteraction, context);

    expect(target.permissionOverwrites.edit).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith({
      content: expect.stringContaining('Gérer les salons'),
      flags: expect.anything(),
    });
  });

  it('verrouille un salon où le membre a « Gérer les salons »', async () => {
    const target = fakeChannel(true);
    const interaction = fakeInteraction(target);

    await lockCommand.execute(interaction as unknown as ChatInputCommandInteraction, context);

    expect(target.permissionOverwrites.edit).toHaveBeenCalledTimes(1);
  });
});
