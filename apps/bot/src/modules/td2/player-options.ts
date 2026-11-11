import { TD2_PLATFORM_LABELS, type Td2PlatformKey } from '@phenix/shared';
import type { ChatInputCommandInteraction, SlashCommandSubcommandBuilder } from 'discord.js';

const PLATFORM_CHOICES = (Object.keys(TD2_PLATFORM_LABELS) as Td2PlatformKey[]).map((value) => ({
  name: TD2_PLATFORM_LABELS[value],
  value,
}));

/**
 * Les options « plateforme » puis « pseudo », communes à signaler, signalements, lier et stats.
 * Le pseudo est proposé au fil de la frappe, parmi les joueurs de la plateforme déjà choisie.
 * Une autocomplétion n'est qu'une suggestion : un pseudo tapé à la main passe aussi.
 */
export const playerOptions =
  ({ required, platform }: { required: boolean; platform: string }) =>
  (sub: SlashCommandSubcommandBuilder): SlashCommandSubcommandBuilder =>
    sub
      .addStringOption((option) =>
        option
          .setName('plateforme')
          .setDescription(platform)
          .setRequired(required)
          .addChoices(...PLATFORM_CHOICES),
      )
      .addStringOption((option) =>
        option
          .setName('pseudo')
          .setDescription('Le pseudo en jeu, tel qu’il s’affiche')
          .setRequired(required)
          .setMaxLength(32)
          .setAutocomplete(true),
      );

/** La plateforme et le pseudo d'une sous-commande où les deux sont obligatoires. */
export const readPlayer = (interaction: ChatInputCommandInteraction) => ({
  platform: interaction.options.getString('plateforme', true) as Td2PlatformKey,
  playerName: interaction.options.getString('pseudo', true).trim(),
});
