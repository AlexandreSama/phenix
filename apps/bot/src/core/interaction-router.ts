import { MessageFlags, type Interaction } from 'discord.js';
import type { Logger } from '../logger.js';
import type { ComponentHandler, SlashCommand } from './command.js';
import { parseCustomId } from './custom-id.js';

interface RouterDeps {
  commands: Map<string, SlashCommand>;
  components: Map<string, ComponentHandler>;
  logger: Pick<Logger, 'error' | 'warn'>;
}

export const ERROR_MESSAGE = 'Oups, une erreur est survenue. Réessaie dans un instant.';

/** Aiguille chaque interaction vers sa commande ou son handler, et rattrape toutes les erreurs. */
export function createInteractionHandler({ commands, components, logger }: RouterDeps) {
  return async (interaction: Interaction): Promise<void> => {
    try {
      if (interaction.isChatInputCommand()) {
        const command = commands.get(interaction.commandName);
        if (!command) {
          logger.warn({ command: interaction.commandName }, 'Commande inconnue');
          return;
        }
        await command.execute(interaction);
        return;
      }

      if (interaction.isAutocomplete()) {
        await commands.get(interaction.commandName)?.autocomplete?.(interaction);
        return;
      }

      if (interaction.isMessageComponent() || interaction.isModalSubmit()) {
        const { prefix, id } = parseCustomId(interaction.customId);
        const handler = components.get(prefix);
        if (!handler) {
          logger.warn({ customId: interaction.customId }, 'Composant inconnu');
          return;
        }
        await handler.execute(interaction, id);
      }
    } catch (error) {
      logger.error({ err: error, interactionId: interaction.id }, 'Échec du traitement');
      await replyWithError(interaction);
    }
  };
}

async function replyWithError(interaction: Interaction): Promise<void> {
  if (!interaction.isRepliable()) return;
  const payload = { content: ERROR_MESSAGE, flags: MessageFlags.Ephemeral } as const;
  try {
    if (interaction.deferred || interaction.replied) await interaction.followUp(payload);
    else await interaction.reply(payload);
  } catch {
    // L'interaction a expiré : rien d'autre à faire
  }
}
