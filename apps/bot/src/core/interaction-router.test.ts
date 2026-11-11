import { MessageFlags, type Interaction } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import type { ComponentHandler, SlashCommand } from './command.js';
import type { BotContext } from './context.js';
import { createInteractionHandler, ERROR_MESSAGE } from './interaction-router.js';

const logger = { error: vi.fn(), warn: vi.fn() };
const context = { db: {}, logger } as unknown as BotContext;

/** Fausse interaction de slash command, juste ce que le routeur lit. */
function chatInput(commandName: string, state: { deferred?: boolean } = {}) {
  return {
    id: '1',
    commandName,
    deferred: state.deferred ?? false,
    replied: false,
    isChatInputCommand: () => true,
    isAutocomplete: () => false,
    isMessageComponent: () => false,
    isModalSubmit: () => false,
    isRepliable: () => true,
    reply: vi.fn(),
    followUp: vi.fn(),
  };
}

function button(customId: string) {
  return {
    id: '2',
    customId,
    isChatInputCommand: () => false,
    isAutocomplete: () => false,
    isMessageComponent: () => true,
    isModalSubmit: () => false,
    isRepliable: () => true,
    deferred: false,
    replied: false,
    reply: vi.fn(),
  };
}

function command(name: string, execute: SlashCommand['execute']): SlashCommand {
  return {
    category: 'utils',
    data: { name, toJSON: () => ({ name, description: name }) },
    execute,
  };
}

describe('createInteractionHandler', () => {
  it('exécute la commande demandée', async () => {
    const execute = vi.fn();
    const handle = createInteractionHandler({
      commands: new Map([['ping', command('ping', execute)]]),
      components: new Map(),
      context,
    });
    const interaction = chatInput('ping');

    await handle(interaction as unknown as Interaction);

    expect(execute).toHaveBeenCalledWith(interaction, context);
  });

  it('envoie le bouton à son handler avec l’id extrait', async () => {
    const execute = vi.fn();
    const handler: ComponentHandler = { prefix: 'giveaway:join', execute };
    const handle = createInteractionHandler({
      commands: new Map(),
      components: new Map([[handler.prefix, handler]]),
      context,
    });

    await handle(button('giveaway:join:42') as unknown as Interaction);

    expect(execute).toHaveBeenCalledWith(expect.anything(), '42', context);
  });

  it('répond un message d’erreur discret quand la commande plante', async () => {
    const handle = createInteractionHandler({
      commands: new Map([['ping', command('ping', () => Promise.reject(new Error('boom')))]]),
      components: new Map(),
      context,
    });
    const interaction = chatInput('ping');

    await handle(interaction as unknown as Interaction);

    expect(interaction.reply).toHaveBeenCalledWith({
      content: ERROR_MESSAGE,
      flags: MessageFlags.Ephemeral,
    });
    expect(logger.error).toHaveBeenCalled();
  });

  it('utilise followUp si la commande avait déjà différé sa réponse', async () => {
    const handle = createInteractionHandler({
      commands: new Map([['ping', command('ping', () => Promise.reject(new Error('boom')))]]),
      components: new Map(),
      context,
    });
    const interaction = chatInput('ping', { deferred: true });

    await handle(interaction as unknown as Interaction);

    expect(interaction.followUp).toHaveBeenCalled();
    expect(interaction.reply).not.toHaveBeenCalled();
  });
});
