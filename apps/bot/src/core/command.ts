import type {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  MessageComponentInteraction,
  ModalSubmitInteraction,
  RESTPostAPIChatInputApplicationCommandsJSONBody,
} from 'discord.js';

export type CommandCategory = 'fun' | 'utils' | 'moderation' | 'admin' | 'td2';

/** Une slash command : sa définition pour Discord et ce qu'elle fait. */
export interface SlashCommand {
  data: { name: string; toJSON(): RESTPostAPIChatInputApplicationCommandsJSONBody };
  category: CommandCategory;
  execute(interaction: ChatInputCommandInteraction): Promise<void>;
  autocomplete?(interaction: AutocompleteInteraction): Promise<void>;
}

/** Un bouton, menu ou modal, retrouvé grâce au début de son customId (`module:action`). */
export interface ComponentHandler {
  prefix: string;
  execute(
    interaction: MessageComponentInteraction | ModalSubmitInteraction,
    id: string | undefined,
  ): Promise<void>;
}
