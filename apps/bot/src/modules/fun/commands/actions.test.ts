import type { ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import type { BotContext } from '../../../core/context.js';
import { createActionCommand } from './actions.js';

/** Les commandes Fun n'utilisent ni la base ni les logs. */
const context = {} as BotContext;

const user = (id: string) => ({ id, toString: () => `<@${id}>` });

function fakeInteraction(authorId: string, targetId: string) {
  const interaction = {
    user: user(authorId),
    options: { getUser: () => user(targetId) },
    reply: vi.fn(),
    deferReply: vi.fn(),
    editReply: vi.fn(),
  };
  return interaction;
}

const embedOf = (call: unknown[]) => (call[0] as { embeds: EmbedBuilder[] }).embeds[0]?.data;

describe('createActionCommand', () => {
  const config = {
    name: 'hug',
    description: 'Fais un câlin',
    gif: 'hug' as const,
    phrase: (a: { toString(): string }, t: { toString(): string }) => `${a} câline ${t}`,
  };

  it('affiche la phrase et le GIF', async () => {
    const gifs = vi.fn().mockResolvedValue('https://exemple.test/hug.gif');
    const interaction = fakeInteraction('1', '2');

    await createActionCommand(config, gifs).execute(
      interaction as unknown as ChatInputCommandInteraction,
      context,
    );

    expect(interaction.deferReply).toHaveBeenCalled();
    const embed = embedOf(interaction.editReply.mock.calls[0] ?? []);
    expect(embed?.description).toBe('<@1> câline <@2>');
    expect(embed?.image?.url).toBe('https://exemple.test/hug.gif');
  });

  it('répond quand même sans GIF si le service est en panne', async () => {
    const interaction = fakeInteraction('1', '2');

    await createActionCommand(config, vi.fn().mockResolvedValue(null)).execute(
      interaction as unknown as ChatInputCommandInteraction,
      context,
    );

    const embed = embedOf(interaction.editReply.mock.calls[0] ?? []);
    expect(embed?.description).toBe('<@1> câline <@2>');
    expect(embed?.image).toBeUndefined();
  });

  it('refuse de se viser soi-même quand aucune phrase n’est prévue', async () => {
    const gifs = vi.fn();
    const interaction = fakeInteraction('1', '1');

    await createActionCommand(config, gifs).execute(
      interaction as unknown as ChatInputCommandInteraction,
      context,
    );

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: "Choisis quelqu'un d'autre que toi." }),
    );
    expect(gifs).not.toHaveBeenCalled();
  });
});
