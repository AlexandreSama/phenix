import type {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  MessageComponentInteraction,
  ModalSubmitInteraction,
  RESTPostAPIChatInputApplicationCommandsJSONBody,
} from 'discord.js';
import type { BotContext } from './context.js';

export type CommandCategory =
  'fun' | 'utils' | 'moderation' | 'admin' | 'td2' | 'leveling' | 'giveaways';

/** Une slash command : sa définition pour Discord et ce qu'elle fait. */
export interface SlashCommand {
  data: { name: string; toJSON(): RESTPostAPIChatInputApplicationCommandsJSONBody };
  category: CommandCategory;
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
