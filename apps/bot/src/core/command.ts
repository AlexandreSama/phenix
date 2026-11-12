import type {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  MessageComponentInteraction,
  ModalSubmitInteraction,
  RESTPostAPIChatInputApplicationCommandsJSONBody,
} from 'discord.js';
import type { BotContext } from './context.js';

export type CommandCategory =
  'fun' | 'utils' | 'moderation' | 'leveling' | 'giveaways' | 'admin' | 'td2';

/** Une slash command : sa définition pour Discord et ce qu'elle fait. */
export interface SlashCommand {
  data: { name: string; toJSON(): RESTPostAPIChatInputApplicationCommandsJSONBody };
  category: CommandCategory;
  /**
   * La permission Discord que le membre doit avoir : le routeur la vérifie lui-même. Le réglage
   * `setDefaultMemberPermissions` de la définition n'est qu'une suggestion à Discord, qu'un administrateur
   * peut surcharger dans les réglages d'intégration du serveur ; une commande qui agit sur des personnes
   * la déclare ici, avec la même valeur.
   */
  requiredPermissions?: bigint;
  execute(interaction: ChatInputCommandInteraction, context: BotContext): Promise<void>;
  autocomplete?(interaction: AutocompleteInteraction, context: BotContext): Promise<void>;
}

/** Un bouton, menu ou modal, retrouvé grâce au début de son customId (`module:action`). */
export interface ComponentHandler {
  prefix: string;
  execute(
    interaction: MessageComponentInteraction | ModalSubmitInteraction,
    id: string | undefined,
    context: BotContext,
  ): Promise<void>;
}
