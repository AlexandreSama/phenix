import {
  MessageFlags,
  type ChatInputCommandInteraction,
  type SlashCommandStringOption,
  type SlashCommandUserOption,
} from 'discord.js';

/** Limite de Discord pour la raison inscrite au journal d'audit. */
export const REASON_MAX = 512;

export const NOT_A_MEMBER = "Ce membre n'est pas sur le serveur.";

export const memberOption = (description: string) => (option: SlashCommandUserOption) =>
  option.setName('membre').setDescription(description).setRequired(true);

export const reasonOption =
  (required = false) =>
  (option: SlashCommandStringOption) =>
    option
      .setName('raison')
      .setDescription('La raison, inscrite dans les logs')
      .setRequired(required)
      .setMaxLength(REASON_MAX);

/** Refus visible du seul modérateur. */
export async function refuse(
  interaction: ChatInputCommandInteraction,
  message: string,
): Promise<void> {
  await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
}
