import { MessageFlags, type Interaction } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import type { ComponentHandler, SlashCommand } from './command.js';
import type { BotContext } from './context.js';
import { createInteractionHandler, ERROR_MESSAGE } from './interaction-router.js';

const logger = { error: vi.fn(), warn: vi.fn() };
const context = { db: {}, logger } as unknown as BotContext;

/** Fausse interaction de slash command, juste ce que le routeur lit. */
function chatInput(
  commandName: string,
  state: { deferred?: boolean; guildId?: string | null; subcommand?: string } = {},
) {
  return {
    id: '1',
    commandName,
    guildId: state.guildId === undefined ? '100000000000000001' : state.guildId,
    options: {
      getSubcommandGroup: () => null,
      getSubcommand: () => state.subcommand ?? null,
    },
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

  describe('compte des commandes', () => {
    it('compte la commande, son serveur, sa durée et son succès', async () => {
      const usage = { record: vi.fn() };
      const handle = createInteractionHandler({
        commands: new Map([['td2', command('td2', async () => {})]]),
        components: new Map(),
        context,
        usage,
      });

      await handle(chatInput('td2', { subcommand: 'mission' }) as unknown as Interaction);

      expect(usage.record).toHaveBeenCalledWith({
        guildId: '100000000000000001',
        command: 'td2 mission',
        durationMs: expect.any(Number),
        ok: true,
      });
    });

    it('compte une erreur, hors serveur, et répond quand même le message d’erreur', async () => {
      const usage = { record: vi.fn() };
      const handle = createInteractionHandler({
        commands: new Map([['ping', command('ping', () => Promise.reject(new Error('boom')))]]),
        components: new Map(),
        context,
        usage,
      });
      const interaction = chatInput('ping', { guildId: null });

      await handle(interaction as unknown as Interaction);

      expect(usage.record).toHaveBeenCalledWith(
        expect.objectContaining({ guildId: null, command: 'ping', ok: false }),
      );
      expect(interaction.reply).toHaveBeenCalledWith(
        expect.objectContaining({ content: ERROR_MESSAGE }),
      );
    });

    it('un compteur qui plante ne change rien pour la commande', async () => {
      const usage = {
        record: vi.fn(() => {
          throw new Error('compteur cassé');
        }),
      };
      const handle = createInteractionHandler({
        commands: new Map([['ping', command('ping', async () => {})]]),
        components: new Map(),
        context,
        usage,
      });
      const interaction = chatInput('ping');

      await handle(interaction as unknown as Interaction);

      expect(interaction.reply).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.anything(),
        'Usage de la commande non compté',
      );
    });

    it('ne compte ni l’autocomplétion, ni les boutons, ni une commande inconnue', async () => {
      const usage = { record: vi.fn() };
      const autocomplete = vi.fn();
      const handle = createInteractionHandler({
        commands: new Map([['td2', { ...command('td2', async () => {}), autocomplete }]]),
        components: new Map([
          ['giveaway:join', { prefix: 'giveaway:join', execute: vi.fn() } as ComponentHandler],
        ]),
        context,
        usage,
      });

      await handle({
        ...chatInput('td2'),
        isChatInputCommand: () => false,
        isAutocomplete: () => true,
      } as unknown as Interaction);
      await handle(button('giveaway:join:1') as unknown as Interaction);
      await handle(chatInput('inconnue') as unknown as Interaction);

      expect(autocomplete).toHaveBeenCalled();
      expect(usage.record).not.toHaveBeenCalled();
    });
  });
});
