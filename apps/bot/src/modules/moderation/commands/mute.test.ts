import type { ChatInputCommandInteraction } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import type { BotContext } from '../../../core/context.js';
import { mute } from './mute.js';

/** Fausse interaction : seulement ce que /mute lit avant d'agir. */
function fakeInteraction(duration: string, member: object | null = { id: '2' }) {
  return {
    inCachedGuild: () => true,
    options: {
      getMember: () => member,
      getString: (name: string) => (name === 'durée' ? duration : null),
    },
    reply: vi.fn(),
    deferReply: vi.fn(),
  };
}

async function run(interaction: ReturnType<typeof fakeInteraction>) {
  await mute.execute(interaction as unknown as ChatInputCommandInteraction, {} as BotContext);
  return interaction.reply.mock.calls[0]?.[0] as { content: string } | undefined;
}

describe('/mute', () => {
  it('refuse une durée illisible', async () => {
    expect((await run(fakeInteraction('demain')))?.content).toContain('Durée illisible');
  });

  it('refuse plus de 28 jours', async () => {
    expect((await run(fakeInteraction('29j')))?.content).toContain('28 jours');
  });

  it('refuse un utilisateur absent du serveur', async () => {
    expect((await run(fakeInteraction('10m', null)))?.content).toContain(
      "n'est pas sur le serveur",
    );
  });
});
