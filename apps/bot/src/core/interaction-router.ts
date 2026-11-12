import { MessageFlags, type Interaction } from 'discord.js';
import type { ComponentHandler, SlashCommand } from './command.js';
import { fullCommandName, type CommandUsageRecorder } from './command-usage.js';
import type { BotContext } from './context.js';
import { parseCustomId } from './custom-id.js';

interface RouterDeps {
  commands: Map<string, SlashCommand>;
  components: Map<string, ComponentHandler>;
  /** Transmis tel quel à chaque commande et handler */
  context: BotContext;
  /** Compte chaque slash command (page Métriques) ; ni l'autocomplétion ni les boutons */
  usage?: Pick<CommandUsageRecorder, 'record'>;
}

export const MISSING_PERMISSION =
  'Il te manque une permission Discord pour utiliser cette commande.';

export const ERROR_MESSAGE = 'Oups, une erreur est survenue. Réessaie dans un instant.';

/** Aiguille chaque interaction vers sa commande ou son handler, et rattrape toutes les erreurs. */
export function createInteractionHandler({ commands, components, context, usage }: RouterDeps) {
  const { logger } = context;
  return async (interaction: Interaction): Promise<void> => {
    try {
      if (interaction.isChatInputCommand()) {
        const command = commands.get(interaction.commandName);
        if (!command) {
          logger.warn({ command: interaction.commandName }, 'Commande inconnue');
          return;
        }
        // Administrateur ou propriétaire : `has` les compte déjà. Inconnu (message privé) : refusé
        if (
          command.requiredPermissions !== undefined &&
          !interaction.memberPermissions?.has(command.requiredPermissions)
        ) {
          await interaction.reply({ content: MISSING_PERMISSION, flags: MessageFlags.Ephemeral });
          return;
        }
        const started = performance.now();
        let ok = false;
        try {
          await command.execute(interaction, context);
          ok = true;
        } finally {
          // Le compte ne doit jamais changer le sort de la commande
          try {
            usage?.record({
              guildId: interaction.guildId,
              command: fullCommandName(interaction),
              durationMs: performance.now() - started,
              ok,
            });
          } catch (err) {
            logger.warn({ err }, 'Usage de la commande non compté');
          }
        }
        return;
      }

      if (interaction.isAutocomplete()) {
        const command = commands.get(interaction.commandName);
        // Les suggestions (numéros, lots…) sont des données : même permission que la commande
        if (
          command?.requiredPermissions !== undefined &&
          !interaction.memberPermissions?.has(command.requiredPermissions)
        ) {
          await interaction.respond([]);
          return;
        }
        await command?.autocomplete?.(interaction, context);
        return;
      }

      if (interaction.isMessageComponent() || interaction.isModalSubmit()) {
        const { prefix, id } = parseCustomId(interaction.customId);
        const handler = components.get(prefix);
        if (!handler) {
          logger.warn({ customId: interaction.customId }, 'Composant inconnu');
          return;
        }
        await handler.execute(interaction, id, context);
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
